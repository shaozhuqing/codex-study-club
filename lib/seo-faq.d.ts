export type SeoFaqItem = {
  question: string;
  answer: string;
};

export function extractFaqItems(markdown: string): SeoFaqItem[];
