export const state = {
  typed: '',
  callActive: false,
  activeSeconds: 0,
  footerSeconds: 0,
  timer: null,
  activeNumber: null,

  contacts: [
    ['AK','Andi Kelmendi','+355 69 123 4567'],
    ['BM','Besa Marku','+355 68 234 5678'],
    ['EL','Erjon Leka','+355 67 345 6789'],
    ['HD','Help Desk','1000']
  ],

  lines: [],
  activeLineId: null,
  incomingLineId: null
};
