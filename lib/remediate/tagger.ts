import { extractRemediationPlan } from './extractor';
import type { DetectedTable, ArtifactItem } from './heuristics';

export interface TagNode {
  type: string;
  children?: TagNode[];
  text?: string;
  page?: number;
}

/** Group consecutive list items under a single L node. Start a new L when
 *  there is a page gap > 1 between adjacent items. */
function groupListItems(items: Array<{ text: string; page: number }>): TagNode[] {
  if (!items.length) return [];

  const groups: TagNode[] = [];
  let currentList: TagNode = { type: 'L', page: items[0]!.page, children: [] };

  for (const item of items) {
    if (
      currentList.children!.length > 0 &&
      Math.abs(item.page - (currentList.children![currentList.children!.length - 1]!.page ?? item.page)) > 1
    ) {
      groups.push(currentList);
      currentList = { type: 'L', page: item.page, children: [] };
    }

    currentList.children!.push({
      type: 'LI',
      page: item.page,
      children: [
        { type: 'Lbl', text: item.text.split(/\s+/, 1)[0] ?? '', page: item.page },
        { type: 'LBody', text: item.text, page: item.page },
      ],
    });
  }

  if (currentList.children!.length > 0) groups.push(currentList);
  return groups;
}

/** Convert detected tables into Table > TR > TH/TD tag nodes. */
function buildTableNodes(tables: DetectedTable[]): TagNode[] {
  return tables.map((table) => ({
    type: 'Table',
    page: table.page,
    children: table.rows.map((row) => ({
      type: 'TR',
      page: table.page,
      children: row.cells.map((cell) => ({
        type: cell.isHeader ? 'TH' : 'TD',
        text: cell.text,
        page: table.page,
      })),
    })),
  }));
}

/** Build a set of artifact position keys for fast lookup. */
function buildArtifactSet(artifacts: ArtifactItem[]): Set<string> {
  const set = new Set<string>();
  for (const a of artifacts) {
    set.add(`${a.page}|${Math.round(a.x)}|${Math.round(a.y)}`);
  }
  return set;
}

/** Nest flat nodes into Sect elements based on heading hierarchy.
 *  When a heading is encountered, a new Sect is created. Subsequent
 *  non-heading nodes are placed inside it. Deeper headings create
 *  nested Sect elements. */
function nestIntoSections(nodes: TagNode[]): TagNode[] {
  const stack: { level: number; sect: TagNode }[] = [];
  const result: TagNode[] = [];

  for (const node of nodes) {
    const headingMatch = node.type.match(/^H(\d)$/);
    if (headingMatch) {
      const level = parseInt(headingMatch[1]!, 10);

      // Pop sections at same or deeper level
      while (stack.length > 0 && stack[stack.length - 1]!.level >= level) {
        stack.pop();
      }

      const sect: TagNode = { type: 'Sect', children: [node], page: node.page };

      if (stack.length > 0) {
        stack[stack.length - 1]!.sect.children!.push(sect);
      } else {
        result.push(sect);
      }

      stack.push({ level, sect });
    } else {
      if (stack.length > 0) {
        stack[stack.length - 1]!.sect.children!.push(node);
      } else {
        result.push(node);
      }
    }
  }

  return result;
}

export function buildTagTree(plan: ReturnType<typeof extractRemediationPlan>): TagNode {
  const headingNodes: TagNode[] = plan.headings.map((heading) => ({
    type: `H${heading.level}`,
    text: heading.text,
    page: heading.page,
  }));

  const listNodes = groupListItems(plan.listItems);
  const tableNodes = buildTableNodes(plan.tables);

  const paragraphNodes: TagNode[] = plan.paragraphs.slice(0, 400).map((paragraph) => ({
    type: 'P',
    text: paragraph.text,
    page: paragraph.page,
  }));

  // Interleave all nodes by page order then nest into sections
  const allNodes = [...headingNodes, ...listNodes, ...tableNodes, ...paragraphNodes].sort(
    (a, b) => (a.page ?? 0) - (b.page ?? 0)
  );

  const sectioned = nestIntoSections(allNodes);

  return {
    type: 'Document',
    children: sectioned,
  };
}
