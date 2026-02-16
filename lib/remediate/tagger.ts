import { extractRemediationPlan } from './extractor';

export interface TagNode {
  type: string;
  children?: TagNode[];
  text?: string;
  page?: number;
}

export function buildTagTree(plan: ReturnType<typeof extractRemediationPlan>): TagNode {
  const headingNodes: TagNode[] = plan.headings.map((heading) => ({
    type: `H${heading.level}`,
    text: heading.text,
    page: heading.page
  }));

  const listNodes: TagNode[] = plan.listItems.map((item) => ({
    type: 'L',
    page: item.page,
    children: [
      {
        type: 'LI',
        page: item.page,
        children: [
          { type: 'Lbl', text: item.text.split(/\s+/, 1)[0] ?? '', page: item.page },
          { type: 'LBody', text: item.text, page: item.page }
        ]
      }
    ]
  }));

  const paragraphNodes: TagNode[] = plan.paragraphs.slice(0, 400).map((paragraph) => ({
    type: 'P',
    text: paragraph.text,
    page: paragraph.page
  }));

  return {
    type: 'Document',
    children: [...headingNodes, ...listNodes, ...paragraphNodes]
  };
}
