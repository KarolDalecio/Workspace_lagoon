/**
 * Pixel arts dos quadros: grades de 16×12, um caractere por pixel.
 * Desenhos próprios que remetem aos temas — não são imagens oficiais.
 */
interface PixelArt {
  palette: Record<string, string>;
  rows: string[];
}

const ART: Record<string, PixelArt> = {
  cafe: {
    palette: { '.': '#f3e9d7', s: '#c9b8a6', o: '#3a2a20', b: '#6b3e26', w: '#ffffff', p: '#d9cbb8' },
    rows: [
      '................',
      '.....s...s......',
      '......s...s.....',
      '.....s...s......',
      '..oooooooooo....',
      '..obbbbbbbbooo..',
      '..owwwwwwwwo.o..',
      '..owwwwwwwwo.o..',
      '..owwwwwwwwooo..',
      '...owwwwwwo.....',
      '.pppoooooopppp..',
      '................',
    ],
  },
  graos: {
    palette: { '.': '#e8d9bf', b: '#6b3e26', B: '#4a2a18', l: '#8a5a3c' },
    rows: [
      '................',
      '..bbb......bbb..',
      '.bbBbb....bbBbb.',
      '.blBbb....blBbb.',
      '.bbBbb.bb.bbBbb.',
      '..bbb.bbBb.bbb..',
      '......blBb......',
      '..bbb.bbBb.bbb..',
      '.bbBbb.bb.bbBbb.',
      '.blBbb....blBbb.',
      '..bbb......bbb..',
      '................',
    ],
  },
  droide: {
    palette: { '.': '#1b1f3a', '*': '#e8e8ff', w: '#f4f1ea', o: '#e8742a', k: '#2a2a2a', g: '#9aa0b0' },
    rows: [
      '*...............',
      '.......kk....*..',
      '......wwww......',
      '.....wwkwww.....',
      '.....oooooo.....',
      '....wwwwwwww....',
      '...wwooowwoww...',
      '...wowwwowwow..*',
      '...woooowwwow...',
      '...wwwwoooww....',
      '....wwwwwwww....',
      '.*....gggg......',
    ],
  },
  sabre: {
    palette: { '.': '#0f1226', l: '#2a6f9e', b: '#7ee2ff', k: '#3a3f4f', h: '#9aa0b0' },
    rows: [
      '..............l.',
      '.............lbl',
      '............lbl.',
      '...........lbl..',
      '..........lbl...',
      '.........lbl....',
      '........lbl.....',
      '.......lbl......',
      '......kh........',
      '.....hk.........',
      '....kh..........',
      '................',
    ],
  },
  anel: {
    palette: { '.': '#2a1a12', y: '#f4c542', Y: '#c99a2a', r: '#e8742a' },
    rows: [
      '................',
      '................',
      '.....yyyyyy.....',
      '....yYrrrrYy....',
      '...yY......Yy...',
      '...y........y...',
      '...y........y...',
      '...yY......Yy...',
      '....yYrrrrYy....',
      '.....yyyyyy.....',
      '................',
      '................',
    ],
  },
  triforca: {
    palette: { '.': '#123a2a', y: '#f4d35e' },
    rows: [
      '................',
      '................',
      '.......yy.......',
      '......yyyy......',
      '.....yyyyyy.....',
      '....yyyyyyyy....',
      '...yy......yy...',
      '..yyyy....yyyy..',
      '.yyyyyy..yyyyyy.',
      'yyyyyyyyyyyyyyyy',
      '................',
      '................',
    ],
  },
  d20: {
    palette: { '.': '#3a1f4f', r: '#c0392b', R: '#8e1f16', w: '#ffffff' },
    rows: [
      '................',
      '.......rr.......',
      '.....rrrrrr.....',
      '...rrRrrrrRrr...',
      '..rRRrrwwrrRRr..',
      '..rRrrwrrwrrRr..',
      '..rRrrrrwrrrRr..',
      '..rRrrrwrrrrRr..',
      '..rRRrwwwwrRRr..',
      '...rrRrrrrRrr...',
      '.....rrrrrr.....',
      '.......rr.......',
    ],
  },
  castelo: {
    palette: { '.': '#1d2350', '*': '#e8e8ff', m: '#f4e9b0', c: '#3a3f5c', l: '#f4d35e' },
    rows: [
      '..*.........mm..',
      '...........mmm..',
      '....c.......mm.*',
      '...ccc..c.......',
      '...ccc.ccc...c..',
      '...clc.ccc..ccc.',
      '..cccccclc..ccc.',
      '..cccccccccccccc',
      '..cclcccccclcccc',
      '.ccccccccccccccc',
      '.cccccc..ccccccc',
      'cccccccccccccccc',
    ],
  },
  trevo: {
    palette: { '.': '#5a2e1f', K: '#4a4a52', k: '#26262b', g: '#3fa34d', G: '#2a7a36' },
    rows: [
      '................',
      '..KKKKKKKKKKKK..',
      '..KkkkkkkkkkkK..',
      '..KkkkkggkkkkK..',
      '..KkggkggkggkK..',
      '..KkggggggggkK..',
      '..KkkgggGgggkK..',
      '..KkggkGkggkkK..',
      '..KkkkkGkkkkkK..',
      '..KkkkkkkkkkkK..',
      '..KKKKKKKKKKKK..',
      '................',
    ],
  },
};

/** Desenha a arte `id` ocupando o retângulo (x, y, w, h). Retorna false se não existir (ex.: paisagem). */
export function drawArt(ctx: CanvasRenderingContext2D, id: string | undefined, x: number, y: number, w: number, h: number) {
  const art = id ? ART[id] : undefined;
  if (!art) return false;
  const cols = art.rows[0].length;
  const rows = art.rows.length;
  const pw = w / cols;
  const ph = h / rows;
  for (let r = 0; r < rows; r++)
    for (let c = 0; c < cols; c++) {
      ctx.fillStyle = art.palette[art.rows[r][c]] ?? art.palette['.'];
      // +0.05 evita linhas finas entre os pixels quando a escala não é inteira
      ctx.fillRect(x + c * pw, y + r * ph, pw + 0.05, ph + 0.05);
    }
  return true;
}
