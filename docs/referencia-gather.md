# Referência: Mapmaker do Gather → Praça

Levantamento feito a partir da central de ajuda do Gather (artigos "Mapmaker Overview", "Objects Overview", "Tile Effects Overview", "Overview of Meeting Rooms (Private Areas)", "Add or Remove Desks", "Add a Room", "Build Tool Overview", "Mapmaker: Background & Foreground") e do vídeo "Mapmaker Overview" da Gather Academy. A Praça replica o **funcionamento**; arte e mapas são próprios.

## Estrutura de uma sala

| Gather | Praça |
|---|---|
| Espaço com várias Rooms (andares) | `SpaceMap.rooms`, com uma sala de entrada |
| Background (imagem) | Piso pintado por tile + imagem de fundo opcional (upload) |
| Objects (por cima do fundo) | `room.objects` — catálogo com tamanho, cores e rotação |
| Foreground (acima dos avatares) | Imagem de primeiro plano opcional (upload) |
| Tile Effects | Camadas independentes por tile (abaixo) |

## Efeitos de tile

| Efeito | Comportamento | Na Praça |
|---|---|---|
| Impassable | Bloqueia a passagem; objetos em si não bloqueiam | `impassable` — ao carimbar móveis, o editor pinta Bloqueio embaixo (desligável) |
| Spawn | Onde as pessoas aparecem | `spawn` |
| Portal | Teleporta para outra sala/ponto; opção de mão dupla | `portals` — dispara ao pisar, não ao chegar |
| Private Area | Tiles com o mesmo nome formam uma área (mesmo separados); só quem está nela se ouve | `privateAreas` + `areaMeta` |
| Private Area com "claiming" | Vira mesa que um membro pode ocupar | `areaMeta.desk` + `claims` |
| Spotlight | Quem está nele é ouvido por toda a sala | `spotlight` |

Cada efeito é apagado separadamente: a borracha só remove o tipo selecionado no painel.

## Ferramentas do Mapmaker

| Gather | Praça |
|---|---|
| Abas Objects / Tile Effects | Abas Objetos / Efeitos de tile / Piso |
| Select (arrastar move, painel Object details) | Selecionar (V) |
| Stamp | Carimbo (B) — R / Shift+R giram |
| Eraser (objeto fica vermelho ao passar) | Borracha (E) |
| Hand | Mão (H), espaço+arrastar, botão do meio |
| Box Select com filtro Objects/Effects, Copy/Move/Erase Selected | Seleção retangular (M), Ctrl+C / Ctrl+V / Delete |
| Zoom, Undo/Redo (Ctrl+Z) | Iguais, + Ctrl+Shift+Z / Ctrl+Y |
| Object Picker: busca, categorias, cores, rotação | Catálogo "Mais objetos" + Recentes |
| Interações: site, imagem, vídeo, chamada externa, nota | Site, vídeo, imagem (upload), link externo, nota |
| Rooms: criar em branco / de template / de outro espaço | Sala em branco / Escritório / Auditório / Copiar sala existente |
| Menu: Upload/Download Background e Foreground | Menu ☰ → Fundo e primeiro plano |
| Botão Save | Salvamento automático e em tempo real para todos |

## Diferenças conscientes

- O Gather salva com um botão e avisa que dois editores ao mesmo tempo podem sobrescrever um ao outro; aqui cada edição é sincronizada na hora.
- Permissões (Admin/Mapmaker/Builder) ainda não existem: qualquer pessoa no espaço pode editar.
- Holofote usa a mesma malha P2P das conversas, então funciona bem para salas pequenas (o Gather fala em até 100 pessoas).
