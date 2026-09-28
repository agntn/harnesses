const WORDS = [
  "Zero",
  "One",
  "Two",
  "Three",
  "Four",
  "Five",
  "Six",
  "Seven",
  "Eight",
  "Nine",
  "Ten",
  "Eleven",
  "Twelve",
  "Thirteen",
  "Fourteen",
  "Fifteen",
  "Sixteen",
  "Seventeen",
  "Eighteen",
  "Nineteen",
  "Twenty",
];

/** A count as a capitalised English word up to twenty, digits past that, for titles that grow with the registry. */
export function countWord(count: number): string {
  return WORDS[count] ?? String(count);
}

/** A position in a list as `02 / 13`. */
export function filePosition(index: number, total: number): string {
  return `${String(index + 1).padStart(2, "0")} / ${total}`;
}
