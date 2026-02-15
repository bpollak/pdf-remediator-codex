import { extractRemediationPlan } from './extractor';

export interface TagNode {
  type: string;
  children?: TagNode[];
  text?: string;
}

export function buildTagTree(plan: ReturnType<typeof extractRemediationPlan>): TagNode {
  return {
    type: 'Document',
    children: [
      ...plan.headings.map((h) => ({ type: `H${h.level}`, text: h.text })),
      ...plan.textItems.slice(0, 50).map((t) => ({ type: 'P', text: t.text }))
    ]
  };
}
