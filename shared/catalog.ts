/** Catálogo de objetos do Mapmaker. O desenho de cada um fica em client/src/game/objects.ts. */

export type Category = 'escritorio' | 'moveis' | 'interativos' | 'natureza' | 'decoracao' | 'estrutura';

export interface ObjectDef {
  name: string;
  category: Category;
  /** Tamanho em tiles. */
  w: number;
  h: number;
  /** Variações de cor (índice salvo no objeto). */
  colors: string[];
  /** Rotações possíveis: 0 = de frente (para baixo), 1 = esquerda, 2 = de costas, 3 = direita. */
  rotations?: number[];
  /** Ao colocar, também pinta Bloqueio embaixo (dá para apagar depois, como no Gather). */
  blocks: boolean;
  /** Interação criada automaticamente ao colocar (ex.: quadro branco). */
  defaultInteraction?: 'whiteboard';
  /** Objeto com texto editável (placas). Valor é o texto padrão ao colocar. */
  label?: string;
  /** Quadro que mostra uma das artes de ARTS (escolhida no Mapmaker). */
  art?: boolean;
  keywords?: string;
}

export const CATEGORIES: { id: Category; name: string }[] = [
  { id: 'escritorio', name: 'Escritório' },
  { id: 'moveis', name: 'Móveis' },
  { id: 'interativos', name: 'Interativos' },
  { id: 'natureza', name: 'Natureza' },
  { id: 'decoracao', name: 'Decoração' },
  { id: 'estrutura', name: 'Estrutura' },
];

const SEATS = ['#3d4466', '#5b6ee1', '#e15b64', '#2fb380', '#f0a73a', '#8c5bd6', '#e8eaf0', '#7e57c2'];
const WOODS = ['#9b6a3c', '#e8dcc4', '#5a5f73', '#f2f2f2'];
const FABRIC = ['#5b6ee1', '#6c4fa3', '#2fb380', '#e15b64', '#4a4a4a', '#f0a73a'];

/** Artes em pixel dos quadros (o desenho fica em client/src/game/art.ts). Inspiradas nos temas, não cópias. */
export const ARTS: { id: string; name: string; theme: string }[] = [
  { id: 'paisagem', name: 'Paisagem', theme: 'Clássico' },
  { id: 'cafe', name: 'Xícara de café', theme: 'Café' },
  { id: 'graos', name: 'Grãos de café', theme: 'Café' },
  { id: 'droide', name: 'Droide-bola', theme: 'Guerra nas estrelas' },
  { id: 'sabre', name: 'Sabre de luz', theme: 'Guerra nas estrelas' },
  { id: 'anel', name: 'Anel dourado', theme: 'Terra média' },
  { id: 'triforca', name: 'Três triângulos', theme: 'Lenda do herói' },
  { id: 'd20', name: 'Dado de 20 faces', theme: 'RPG de mesa' },
  { id: 'castelo', name: 'Castelo de magia', theme: 'Escola de bruxaria' },
  { id: 'trevo', name: 'Grimório do trevo', theme: 'Trevo negro' },
];
export const ART_IDS = new Set(ARTS.map(a => a.id));

export const CATALOG: Record<string, ObjectDef> = {
  desk: { name: 'Mesa de trabalho', category: 'escritorio', w: 2, h: 1, colors: WOODS, blocks: true, keywords: 'computador monitor' },
  chair: { name: 'Cadeira', category: 'escritorio', w: 1, h: 1, colors: SEATS, rotations: [0, 1, 2, 3], blocks: false, keywords: 'assento' },
  table: { name: 'Mesa de reunião', category: 'escritorio', w: 2, h: 1, colors: ['#a8743f', ...WOODS.slice(1), '#3f8f6a'], blocks: true },
  desklong: { name: 'Mesa de trabalho longa', category: 'escritorio', w: 3, h: 1, colors: ['#9b6a3c', '#e8dcc4', '#5a5f73'], blocks: true, keywords: 'computador monitor baia' },
  smalldesk: { name: 'Mesa de foco', category: 'escritorio', w: 1, h: 1, colors: ['#3a3f4f', '#9b6a3c'], blocks: true, keywords: 'cabine monitor' },
  conftable: { name: 'Mesa de conferência com telão', category: 'escritorio', w: 5, h: 4, colors: ['#7d8597', '#5a5f73'], blocks: true, keywords: 'reunião tela' },
  workstation3: { name: 'PC com 3 monitores', category: 'escritorio', w: 3, h: 1, colors: ['#3a3f4f', '#9b6a3c', '#f2f2f2'], blocks: true, keywords: 'computador setup monitor vertical gamer' },
  workstation5xl: { name: 'Mesa grande com 5 monitores', category: 'escritorio', w: 6, h: 1, colors: ['#3a3f4f', '#9b6a3c', '#f2f2f2'], blocks: true, keywords: 'computador setup monitores mesa grande' },
  coffeemaker: { name: 'Cafeteira de cápsula', category: 'moveis', w: 1, h: 1, colors: ['#1f1f24', '#c0392b', '#f2f2f2'], blocks: false, keywords: 'café cápsula espresso bb-8' },
  workstation5: { name: 'PC com 5 monitores', category: 'escritorio', w: 3, h: 1, colors: ['#3a3f4f', '#9b6a3c', '#f2f2f2'], blocks: true, keywords: 'computador setup monitores trader' },
  doorsign: { name: 'Placa de porta', category: 'escritorio', w: 1, h: 1, colors: ['#2a2e45', '#c99a62', '#2fb380'], blocks: true, label: 'SALA', keywords: 'texto nome cargo' },
  locker: { name: 'Armário', category: 'escritorio', w: 1, h: 1, colors: ['#8a93a6', '#5b6ee1', '#5a5f73'], blocks: true, keywords: 'escaninho' },
  console: { name: 'Painel de controle', category: 'escritorio', w: 1, h: 1, colors: ['#5a5f73', '#3a3f4f'], blocks: true, keywords: 'servidor' },
  cabinet: { name: 'Arquivo', category: 'escritorio', w: 1, h: 1, colors: ['#2fb380', '#5a5f73', '#e15b64'], blocks: true, keywords: 'gaveteiro' },
  printer: { name: 'Impressora', category: 'escritorio', w: 1, h: 1, colors: ['#e8dcc4', '#5a5f73'], blocks: true },
  watercooler: { name: 'Bebedouro', category: 'escritorio', w: 1, h: 1, colors: ['#3fb6d6'], blocks: true, keywords: 'água' },
  podium: { name: 'Púlpito', category: 'escritorio', w: 1, h: 1, colors: ['#6b4423', '#5a5f73'], blocks: true, keywords: 'palco palestra' },

  sofa: { name: 'Sofá', category: 'moveis', w: 2, h: 1, colors: FABRIC, rotations: [0, 2], blocks: true },
  sofaside: { name: 'Sofá lateral', category: 'moveis', w: 1, h: 2, colors: FABRIC, rotations: [1, 3], blocks: true },
  armchair: { name: 'Poltrona', category: 'moveis', w: 1, h: 1, colors: FABRIC, rotations: [0, 1, 2, 3], blocks: false },
  roundtable: { name: 'Mesa redonda', category: 'moveis', w: 1, h: 1, colors: ['#a8743f', '#f2f2f2', '#5a5f73'], blocks: true },
  coffeetable: { name: 'Mesa de centro', category: 'moveis', w: 2, h: 1, colors: ['#f2f2f2', '#a8743f'], blocks: true },
  bookshelf: { name: 'Estante', category: 'moveis', w: 2, h: 1, colors: ['#6b4423', '#e8dcc4'], blocks: true, keywords: 'livros' },
  counter: { name: 'Bancada de cozinha', category: 'moveis', w: 1, h: 1, colors: ['#d9dce3', '#2fb380', '#5a5f73'], blocks: true, keywords: 'pia' },
  diningtable: { name: 'Mesa de refeitório', category: 'moveis', w: 3, h: 2, colors: ['#3f8f6a', '#a8743f', '#e8dcc4'], blocks: true, keywords: 'jantar cozinha' },
  stool: { name: 'Banqueta', category: 'moveis', w: 1, h: 1, colors: ['#e8eaf0', '#3a3f4f'], blocks: false },
  coffeecart: { name: 'Carrinho de café', category: 'moveis', w: 2, h: 2, colors: ['#7a5532', '#3a3f4f'], blocks: true, keywords: 'cafeteria bar' },
  fridge: { name: 'Geladeira', category: 'moveis', w: 1, h: 1, colors: ['#d9dce3', '#4a4a4a', '#e15b64'], blocks: true },

  whiteboard: { name: 'Quadro branco', category: 'interativos', w: 2, h: 1, colors: ['#fbfbfd'], blocks: true, defaultInteraction: 'whiteboard', keywords: 'excalidraw desenho' },
  tv: { name: 'TV', category: 'interativos', w: 2, h: 1, colors: ['#15171f', '#5a5f73'], blocks: true, keywords: 'vídeo televisão' },
  board: { name: 'Mural', category: 'interativos', w: 2, h: 1, colors: ['#c99a62', '#5b6ee1', '#3f8f5a'], blocks: true, keywords: 'avisos recados lousa' },
  document: { name: 'Documento', category: 'interativos', w: 1, h: 1, colors: ['#e15b64', '#5b6ee1', '#2fb380'], blocks: true, keywords: 'papel arquivo' },

  plant: { name: 'Planta', category: 'natureza', w: 1, h: 1, colors: ['#57b85f', '#3f9a4a', '#8c5bd6'], blocks: true },
  tallplant: { name: 'Cipreste', category: 'natureza', w: 1, h: 1, colors: ['#2f7d3a', '#57b85f'], blocks: true, keywords: 'planta alta' },
  tree: { name: 'Árvore', category: 'natureza', w: 1, h: 1, colors: ['#2f7d3a', '#c2551f', '#d98fb5'], blocks: true },
  bush: { name: 'Arbusto', category: 'natureza', w: 1, h: 1, colors: ['#3f9a4a', '#2f7d3a'], blocks: true },
  flowers: { name: 'Flores', category: 'natureza', w: 1, h: 1, colors: ['#f28fb1', '#f4d35e', '#8c5bd6'], blocks: false },
  rock: { name: 'Pedra', category: 'natureza', w: 1, h: 1, colors: ['#9aa0b0', '#c9b48a'], blocks: true },

  lamp: { name: 'Luminária', category: 'decoracao', w: 1, h: 1, colors: ['#f4d35e', '#f2f2f2'], blocks: true },
  fishbowl: { name: 'Aquário', category: 'decoracao', w: 1, h: 1, colors: ['#3fb6d6'], blocks: true, keywords: 'peixe' },
  cat: { name: 'Gato', category: 'decoracao', w: 1, h: 1, colors: ['#4a4a4a', '#f0a73a', '#f2f2f2'], blocks: true, keywords: 'pet animal' },
  videogame: { name: 'Videogame', category: 'decoracao', w: 1, h: 1, colors: ['#f2f2f2', '#3a3f4f'], blocks: false, keywords: 'console controle jogos' },
  turntable: { name: 'Vitrola', category: 'decoracao', w: 1, h: 1, colors: ['#6b4423', '#3a3f4f'], blocks: true, keywords: 'disco música toca-discos' },
  dog: { name: 'Cachorro', category: 'decoracao', w: 1, h: 1, colors: ['#d9a066', '#f2f2f2', '#3a3f4f', '#1c1c22'], blocks: true, label: 'Doguinho', keywords: 'pet animal akita pastor tricolor' },
  dogbed: { name: 'Caminha de pet', category: 'decoracao', w: 1, h: 1, colors: ['#5b6ee1', '#e15b64', '#2fb380', '#8a5a3c'], blocks: false, keywords: 'cachorro gato cama almofada' },
  fishingrod: { name: 'Vara de pesca', category: 'natureza', w: 1, h: 1, colors: ['#6b4423'], blocks: false, keywords: 'pescaria lago' },
  frame: { name: 'Quadro decorativo', category: 'decoracao', w: 1, h: 1, colors: ['#c99a62', '#3a3f4f', '#f2f2f2'], blocks: true, art: true, keywords: 'pintura arte pixel' },
  barrel: { name: 'Barril', category: 'decoracao', w: 1, h: 1, colors: ['#5a5f73', '#c0392b'], blocks: true },
  arcade: { name: 'Fliperama', category: 'decoracao', w: 1, h: 1, colors: ['#8c5bd6', '#e15b64', '#3fb6d6'], blocks: true, keywords: 'jogo videogame' },
  scooter: { name: 'Patinete', category: 'decoracao', w: 1, h: 1, colors: ['#e15b64', '#3a3f4f'], blocks: false, keywords: 'estacionamento' },
  arrowsign: { name: 'Placa com seta', category: 'decoracao', w: 4, h: 1, colors: ['#f2f2f2', '#f4d35e'], rotations: [1, 3], blocks: false, label: 'PLACA', keywords: 'texto direção' },
  plaque: { name: 'Letreiro', category: 'decoracao', w: 2, h: 1, colors: ['#2a2e45', '#f2f2f2'], blocks: false, label: 'TEXTO', keywords: 'texto nome' },
  standsign: { name: 'Placa de pé', category: 'decoracao', w: 1, h: 1, colors: ['#f28fb1', '#5b6ee1', '#f2f2f2'], blocks: true, label: 'P', keywords: 'estacionamento info' },
  screen: { name: 'Biombo', category: 'decoracao', w: 2, h: 1, colors: ['#5b6ee1', '#e8dcc4', '#2fb380'], blocks: true, keywords: 'divisória' },

  wall: { name: 'Parede', category: 'estrutura', w: 1, h: 1, colors: ['#3a3f5c', '#8a3b2e', '#b9a68a', '#e9e4dc', '#d4dae4', '#252a3d'], blocks: true, keywords: 'muro tijolo' },
  window: { name: 'Janela', category: 'estrutura', w: 1, h: 1, colors: ['#5b8def', '#7ad1c9'], blocks: true, keywords: 'vidro' },
  railing: { name: 'Grade de madeira', category: 'estrutura', w: 1, h: 1, colors: ['#7a5532', '#5a5f73'], rotations: [0, 1], blocks: true, keywords: 'cerca corrimão' },
  stairs: { name: 'Escada', category: 'estrutura', w: 2, h: 1, colors: ['#a8743f', '#8a8fa3'], blocks: true, keywords: 'degraus andar' },
  door: { name: 'Porta', category: 'estrutura', w: 1, h: 1, colors: ['#7a5532', '#4a3322', '#c9c2b5'], blocks: false },
  portalpad: { name: 'Portal', category: 'estrutura', w: 1, h: 1, colors: ['#7c4dff', '#2fb380', '#3fb6d6'], blocks: false, keywords: 'teletransporte sala' },
};
