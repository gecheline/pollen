// Shared between PanelTop and PanelBottom — hovering a token in the answer
// text highlights its trace position and vice versa. Used to live as state
// local to one Panel component that rendered both; now that top and bottom
// are siblings in separate rows (see App.tsx), App.tsx owns one of these
// per panel id and passes the value + a setter down to both halves.
export interface Hover {
  index: number
  source: 'text' | 'trace'
}
