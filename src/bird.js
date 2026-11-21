'use strict';
// Pica, magpie's magpie. Every letter is one pixel and '.' is see-through.
// (Magpies are famous for picking up shiny things and keeping them.)

const BIG = [
  '..........................',
  '...................kkk....',
  '..................kKKKk...',
  '.................kKKEKKk..',
  '.................KKKKKKYYY',
  '.................KKKKKKk..',
  '................kKKKKKk...',
  '...............kKKKKWW....',
  '............kBBbKKWWWWW...',
  '..........kBBbbWWBWWWWW...',
  '........kBBBBBWWWBBWWWw...',
  '.....GGkBBBBBBBBBBWWWw....',
  '...gGGGGkkKKKKKKKKKww.....',
  '.gGGG..........L..L.......',
  'gGG............L..L.......',
  'g.............LL.LL.......',
  '..........................',
];

// the small picture, made of whole cells (macOS Terminal)
const MINI = [
  '............',
  '........kkk.',
  '.......kKEKY',
  '.......KKKk.',
  '.....kBbKWW.',
  '..GkBBWBWWW.',
  'gGGkKKKKww..',
  'g......L.L..',
  '............',
];

const INK = { K: '#15171c', k: '#3a4150', W: '#f7f7f4', w: '#c9ced6', B: '#2f62b8', b: '#6a9be6', G: '#1f7f78', g: '#45bfae', E: '#ffffff', L: '#4a505c', Y: '#59606e' };

module.exports = { BIG, MINI, INK, NAME: 'Pica' };
