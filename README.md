# Praça — escritório virtual

Plataforma de escritório virtual no estilo Gather: um mapa 2D onde cada pessoa é um avatar, e áudio/vídeo se conectam automaticamente quando você chega perto de alguém.

## Funcionalidades

- **Mapa 2D** em canvas: escritório com salas de reunião, cabines de foco, biblioteca, cozinha, lounge, recepção e jardim
- **Movimento** com WASD/setas ou clicando no mapa (pathfinding BFS)
- **Multiplayer em tempo real** via Socket.IO, com validação de movimento no servidor
- **Vídeo e áudio por proximidade** (WebRTC P2P): conecta a até 3 tiles de distância, com volume que diminui conforme a distância
- **Áreas privadas**: dentro de uma sala de reunião/cabine, só quem está na mesma área se ouve
- **Compartilhamento de tela com áudio** (som da aba ou do sistema, mixado com o microfone), mutar microfone/câmera, vídeo em destaque (clique no tile)
- **Escolha de microfone, câmera e alto-falante** no lobby e durante a conversa (engrenagem na barra), com medidor de nível do microfone
- **Chat** "Todos" e "Por perto"
- **Emotes** (teclas 1–5), **Alt+F para fumar** (cigarro com fumaça, visível para todos) e personalização de avatar
- **Múltiplos espaços** por URL: `?space=nome-do-time`, cada um com suas salas salvas em `data/spaces/`
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
npm run build
npm start
```

O servidor (porta `$PORT`, padrão 3001) serve o front-end compilado em `dist/` e o Socket.IO.

> WebRTC exige HTTPS fora de `localhost`. Para usuários atrás de NAT restritivo, configure um servidor TURN (ex.: coturn) em `client/src/rtc/peers.ts`.

## Estrutura

```
shared/      tipos, mapa e regras de proximidade (usados por cliente e servidor)
server/      Express + Socket.IO: espaços, jogadores, chat, sinalização WebRTC
client/src/
  game/      motor do jogo, renderização do mapa e avatares, pathfinding
  rtc/       mídia local e malha de conexões WebRTC
  components/ Lobby, Espaço, vídeos, chat e lista de pessoas
```

## Próximos passos

- SFU (LiveKit/mediasoup) para conversas com muitas pessoas (a malha P2P funciona bem até ~6–8)
- Autenticação e persistência (espaços, mapas, histórico de chat)
- Permissões de edição (hoje qualquer pessoa no espaço pode editar o mapa) e tamanho de mapa configurável
- Indicador de quem está falando, status (ocupado/ausente), mensagens diretas
