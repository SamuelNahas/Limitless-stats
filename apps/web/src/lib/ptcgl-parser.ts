import type { DecklistParseResult, ParsedDeckCard } from "@/types/domain";

const sectionPattern = /^(pok[eé]mon|pokemon|trainer|treinador(?:es)?|energy|energia(?:s)?)(?:\s*:\s*\d+)?$/i;
const cardPattern = /^\s*(\d{1,2})\s+(.+?)(?:\s+([A-Z0-9]{2,8})\s+([A-Z0-9-]+))?\s*$/;

function normalizeCategory(value: string): ParsedDeckCard["category"] {
  const section = value.toLocaleLowerCase("pt-BR");
  if (section.startsWith("pok")) return "pokemon";
  if (section.startsWith("train") || section.startsWith("trein")) return "trainer";
  if (section.startsWith("energ")) return "energy";
  return "unknown";
}

export function parsePtcglDecklist(input: string): DecklistParseResult {
  const cards: ParsedDeckCard[] = [];
  const errors: DecklistParseResult["errors"] = [];
  let category: ParsedDeckCard["category"] = "unknown";

  input
    .replace(/^\uFEFF/, "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .forEach((raw, index) => {
      const value = raw.trim();
      const line = index + 1;
      if (!value || /^total cards?/i.test(value)) return;
      const section = value.match(sectionPattern);
      if (section) {
        category = normalizeCategory(section[1]);
        return;
      }
      const match = value.match(cardPattern);
      if (!match) {
        errors.push({ line, message: "Linha não reconhecida", raw });
        return;
      }
      const count = Number(match[1]);
      if (count < 1 || count > 60) {
        errors.push({ line, message: "Quantidade fora do intervalo permitido", raw });
        return;
      }
      cards.push({
        line,
        count,
        name: match[2].trim(),
        setCode: match[3],
        number: match[4],
        category,
      });
    });

  const total = cards.reduce((sum, card) => sum + card.count, 0);
  if (input.trim() && total !== 60) {
    errors.push({ line: 0, message: `A lista possui ${total} cartas; o formato Standard exige 60.`, raw: "" });
  }
  return { cards, total, errors };
}
