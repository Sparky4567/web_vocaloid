export type Note = { word: string; midi: number; beats: number };
export const patterns = { daydream: [0, 4, 7, 4, 2, 5, 4, 0], starlight: [0, 7, 9, 7, 4, 2, 4, 0], bittersweet: [0, 3, 7, 5, 3, 2, 0, -2] };
export type Pattern = keyof typeof patterns;
export function words(text: string) { return text.match(/[a-zA-Z]+(?:['’][a-zA-Z]+)*/g) ?? []; }
export function compose(text: string, pattern: Pattern, root: number): Note[] {
  return words(text).map((word, i, all) => ({word, midi: root + patterns[pattern][i % 8]!, beats: i === all.length - 1 ? 3 : Math.min(2, 1 + (word.match(/[aeiouy]+/gi)?.length ?? 1) * 0.5)}));
}
export function noteName(midi: number) { return ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B'][midi % 12] + String(Math.floor(midi / 12) - 1); }
