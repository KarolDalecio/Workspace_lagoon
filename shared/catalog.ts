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

const SEATS = ['#3d4466', '#5b6ee1', '#e15b64', '#2fb380', '#f0a73a', '#8c5bd6'];
const WOODS = ['#9b6a3c', '#e8dcc4', '#5a5f73', '#f2f2f2'];
const FABRIC = ['#5b6ee1', '#6c4fa3', '#2fb380', '#e15b64', '#4a4a4a', '#f0a73a'];

export const CATALOG: Record<string, ObjectDef> = {
  desk: { name: 'Mesa de trabalho', category: 'escritorio', w: 2, h: 1, colors: WOODS, blocks: true, keywords: 'computador monitor' },
  chair: { name: 'Cadeira', category: 'escritorio', w: 1, h: 1, colors: SEATS, rotations: [0, 1, 2, 3], blocks: false, keywords: 'assento' },
  table: { name: 'Mesa de reunião', category: 'escritorio', w: 2, h: 1, colors: ['#a8743f', ...WOODS.slice(1)], blocks: true },
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
  fridge: { name: 'Geladeira', category: 'moveis', w: 1, h: 1, colors: ['#d9dce3', '#4a4a4a', '#e15b64'], blocks: true },

  whiteboard: { name: 'Quadro branco', category: 'interativos', w: 2, h: 1, colors: ['#fbfbfd'], blocks: true, defaultInteraction: 'whiteboard', keywords: 'excalidraw desenho' },
  tv: { name: 'TV', category: 'interativos', w: 2, h: 1, colors: ['#15171f', '#5a5f73'], blocks: true, keywords: 'vídeo televisão' },
  board: { name: 'Mural', category: 'interativos', w: 2, h: 1, colors: ['#c99a62', '#5b6ee1'], blocks: true, keywords: 'avisos recados' },
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
  screen: { name: 'Biombo', category: 'decoracao', w: 2, h: 1, colors: ['#5b6ee1', '#e8dcc4', '#2fb380'], blocks: true, keywords: 'divisória' },

  wall: { name: 'Parede', category: 'estrutura', w: 1, h: 1, colors: ['#3a3f5c', '#8a3b2e', '#b9a68a', '#e9e4dc'], blocks: true, keywords: 'muro tijolo' },
  door: { name: 'Porta', category: 'estrutura', w: 1, h: 1, colors: ['#7a5532', '#4a3322', '#c9c2b5'], blocks: false },
  portalpad: { name: 'Portal', category: 'estrutura', w: 1, h: 1, colors: ['#7c4dff', '#2fb380', '#3fb6d6'], blocks: false, keywords: 'teletransporte sala' },
};
