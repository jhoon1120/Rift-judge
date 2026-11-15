export type Card = {
  id: string;
  oracleId: string;
  name: string;
  type: string;
  domains: string[];
  energy: number | null;
  power: number | null;
  might: number | null;
  rarity: string;
  set: string;
  setName: string;
  tags: string[];
  text: string;
  keywords: string[];
  imgUrl: string;
};

export type Ruling = {
  id: string;
  card: string;
  question: string;
  answer: string;
  citations: string[];
  url: string;
  rulesVersion: string;
};

export type Rule = {
  n: string;
  t: string;
  c: string;
  d: number;
};

export type IndexMeta = {
  cards: number;
  rulings: number;
  rules: number;
  rulesVersion?: string;
  rulingsSource: {
    name: string;
    url: string;
    license?: string;
    licenseUrl?: string;
    commit?: string;
    committedAt?: string;
  };
  cardsSource: string;
  fetchedNote: string;
};

export type AppIndex = {
  meta: IndexMeta;
  cards: Card[];
  rulings: Ruling[];
  rules: Rule[];
};

export type SearchHit =
  | { kind: "ruling"; score: number; ruling: Ruling }
  | { kind: "card"; score: number; card: Card }
  | { kind: "rule"; score: number; rule: Rule };