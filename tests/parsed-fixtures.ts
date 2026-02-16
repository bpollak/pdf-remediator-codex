import type { ParsedPDF, PageContent, TagNode, TextItem } from "../types/pdf";

function text(
  id: string,
  page: number,
  value: string,
  x: number,
  y: number,
  readingOrder: number,
  options?: Partial<TextItem>
): TextItem {
  return {
    id,
    page,
    text: value,
    box: {
      x,
      y,
      width: Math.max(value.length * 6, 12),
      height: 12
    },
    fontName: options?.fontName ?? "Helvetica",
    fontSize: options?.fontSize ?? 12,
    fontStyle: options?.fontStyle ?? "normal",
    fontWeight: options?.fontWeight ?? 400,
    color: options?.color ?? [0, 0, 0],
    readingOrder,
    isHeadingCandidate: options?.isHeadingCandidate
  };
}

function headingTagTree(): TagNode[] {
  return [
    {
      id: "root",
      tag: "Document",
      children: [
        {
          id: "h1",
          tag: "H1",
          page: 1,
          text: "Accessible Title",
          children: []
        },
        {
          id: "p1",
          tag: "P",
          page: 1,
          text: "Body paragraph",
          children: []
        },
        {
          id: "table-1",
          tag: "Table",
          page: 2,
          children: [
            { id: "tr-1", tag: "TR", page: 2, children: [{ id: "th-1", tag: "TH", page: 2, children: [] }] }
          ]
        },
        {
          id: "list-1",
          tag: "L",
          page: 2,
          children: [
            {
              id: "li-1",
              tag: "LI",
              page: 2,
              children: [
                { id: "lbl-1", tag: "Lbl", page: 2, children: [] },
                { id: "body-1", tag: "LBody", page: 2, children: [] }
              ]
            }
          ]
        }
      ]
    }
  ];
}

const accessiblePages: PageContent[] = [
  {
    pageNumber: 1,
    width: 612,
    height: 792,
    textItems: [
      text("a1", 1, "Accessible Title", 72, 60, 0, { fontSize: 22, fontWeight: 700 }),
      text("a2", 1, "Intro paragraph", 72, 100, 1),
      text("a3", 1, "Visit documentation", 72, 120, 2)
    ],
    imageItems: [
      {
        id: "img-a",
        page: 1,
        box: { x: 72, y: 160, width: 120, height: 80 },
        width: 120,
        height: 80,
        altText: "Diagram of workflow",
        decorative: false
      }
    ],
    linkItems: [
      {
        id: "lnk-a",
        page: 1,
        box: { x: 72, y: 120, width: 130, height: 14 },
        url: "https://example.com/docs",
        text: "Visit documentation"
      }
    ],
    tableItems: [
      {
        id: "tbl-a",
        page: 1,
        box: { x: 72, y: 250, width: 260, height: 80 },
        caption: "Quarterly totals",
        summary: "Totals by quarter",
        cells: [
          { id: "c1", row: 0, col: 0, text: "Q1", header: true, scope: "col" },
          { id: "c2", row: 0, col: 1, text: "Q2", header: true, scope: "col" },
          { id: "c3", row: 1, col: 0, text: "10", header: false },
          { id: "c4", row: 1, col: 1, text: "20", header: false }
        ]
      }
    ],
    listItems: [
      {
        id: "list-a",
        page: 1,
        ordered: true,
        box: { x: 72, y: 350, width: 220, height: 40 },
        items: [
          { id: "li-a1", label: "1.", body: "First step" },
          { id: "li-a2", label: "2.", body: "Second step" }
        ]
      }
    ],
    headingNodes: [
      {
        id: "hd-a1",
        page: 1,
        level: 1,
        text: "Accessible Title",
        sourceTextItemIds: ["a1"]
      }
    ]
  },
  {
    pageNumber: 2,
    width: 612,
    height: 792,
    textItems: [text("b1", 2, "Section Two", 72, 60, 0, { fontSize: 18, fontWeight: 700 })],
    imageItems: [],
    linkItems: [],
    tableItems: [],
    listItems: [],
    headingNodes: [
      {
        id: "hd-a2",
        page: 2,
        level: 2,
        text: "Section Two",
        sourceTextItemIds: ["b1"]
      }
    ]
  },
  {
    pageNumber: 3,
    width: 612,
    height: 792,
    textItems: [text("c1", 3, "Section Three", 72, 60, 0, { fontSize: 18, fontWeight: 700 })],
    imageItems: [],
    linkItems: [],
    tableItems: [],
    listItems: [],
    headingNodes: [
      {
        id: "hd-a3",
        page: 3,
        level: 2,
        text: "Section Three",
        sourceTextItemIds: ["c1"]
      }
    ]
  },
  {
    pageNumber: 4,
    width: 612,
    height: 792,
    textItems: [text("d1", 4, "Section Four", 72, 60, 0, { fontSize: 18, fontWeight: 700 })],
    imageItems: [],
    linkItems: [],
    tableItems: [],
    listItems: [],
    headingNodes: [
      {
        id: "hd-a4",
        page: 4,
        level: 2,
        text: "Section Four",
        sourceTextItemIds: ["d1"]
      }
    ]
  },
  {
    pageNumber: 5,
    width: 612,
    height: 792,
    textItems: [text("e1", 5, "Section Five", 72, 60, 0, { fontSize: 18, fontWeight: 700 })],
    imageItems: [],
    linkItems: [],
    tableItems: [],
    listItems: [],
    headingNodes: [
      {
        id: "hd-a5",
        page: 5,
        level: 2,
        text: "Section Five",
        sourceTextItemIds: ["e1"]
      }
    ]
  }
];

export const accessibleParsed: ParsedPDF = {
  id: "accessible",
  fileName: "accessible.pdf",
  pageCount: 5,
  metadata: {
    title: "Accessible Fixture",
    author: "QA",
    subject: "Accessible subject",
    keywords: ["accessible"],
    language: "en-US",
    pdfUaIdentifier: "1",
    displayDocTitle: true,
    tagged: true,
    hasStructTreeRoot: true,
    hasMarkInfo: true,
    tabOrderFollowsStructure: true
  },
  pages: accessiblePages,
  tagTree: headingTagTree(),
  bookmarks: [
    { id: "bm1", title: "Accessible Title", page: 1, children: [] },
    { id: "bm2", title: "Section Two", page: 2, children: [] }
  ],
  forms: [
    {
      id: "form-a",
      name: "email",
      type: "text",
      required: true,
      label: "Email (required)",
      tooltip: "Email required",
      page: 1
    }
  ],
  rawTextLength: 400,
  warnings: []
};

function duplicate<T>(value: T): T {
  return structuredClone(value);
}

export const untaggedParsed: ParsedPDF = (() => {
  const parsed = duplicate(accessibleParsed);
  parsed.id = "untagged";
  parsed.fileName = "untagged.pdf";
  parsed.metadata.title = undefined;
  parsed.metadata.subject = undefined;
  parsed.metadata.language = undefined;
  parsed.metadata.pdfUaIdentifier = undefined;
  parsed.metadata.displayDocTitle = false;
  parsed.metadata.tagged = false;
  parsed.metadata.hasStructTreeRoot = false;
  parsed.metadata.tabOrderFollowsStructure = false;
  parsed.tagTree = [];
  parsed.bookmarks = [];
  parsed.pages = parsed.pages.map((page) => ({
    ...page,
    headingNodes: [],
    listItems: [],
    textItems: [
      text(`${page.pageNumber}-t1`, page.pageNumber, "- first", 72, 80, 0),
      text(`${page.pageNumber}-t2`, page.pageNumber, "- second", 72, 96, 1),
      ...Array.from({ length: 9 }, (_, index) =>
        text(`${page.pageNumber}-tx-${index}`, page.pageNumber, `Body text ${index}`, 72, 120 + index * 14, index + 2)
      )
    ],
    imageItems:
      page.pageNumber === 1
        ? [
            {
              id: "img-u",
              page: 1,
              box: { x: 8, y: 20, width: 20, height: 20 },
              width: 20,
              height: 20,
              decorative: false
            }
          ]
        : [],
    linkItems: [],
    tableItems: []
  }));
  parsed.forms = [
    {
      id: "form-u",
      name: "email",
      type: "text",
      required: true,
      label: "Email",
      tooltip: "",
      page: 1
    },
    {
      id: "form-u2",
      name: "comments",
      type: "text",
      required: false,
      label: "",
      tooltip: "",
      page: 1
    }
  ];
  return parsed;
})();

export const partialParsed: ParsedPDF = (() => {
  const parsed = duplicate(accessibleParsed);
  parsed.id = "partial";
  parsed.fileName = "partial.pdf";
  parsed.metadata.subject = undefined;
  parsed.metadata.language = undefined;
  parsed.metadata.pdfUaIdentifier = undefined;
  parsed.metadata.hasStructTreeRoot = false;
  parsed.metadata.tabOrderFollowsStructure = false;
  parsed.tagTree = [
    {
      id: "root-p",
      tag: "Document",
      children: [{ id: "p-p", tag: "P", page: 1, text: "body", children: [] }]
    }
  ];
  parsed.bookmarks = [];
  parsed.pages[0].headingNodes = [
    { id: "h1", page: 1, level: 1, text: "Heading One", sourceTextItemIds: ["a1"] },
    { id: "h3", page: 1, level: 3, text: "Heading Three", sourceTextItemIds: ["a2"] },
    { id: "h-empty", page: 1, level: 4, text: "", sourceTextItemIds: ["a3"] }
  ];
  parsed.pages[0].textItems = [
    text("p1", 1, "First paragraph", 72, 60, 3),
    text("p2", 1, "Second paragraph", 72, 90, 1),
    text("p3", 1, "Third paragraph", 72, 120, 0),
    text("p4", 1, "Status", 72, 150, 2, { color: [200, 0, 0] }),
    text("p5", 1, "Status", 150, 150, 4, { color: [0, 0, 0] }),
    text("p6", 1, "Low contrast note", 72, 176, 5, { color: [200, 200, 200] })
  ];
  parsed.pages[0].imageItems = [
    {
      id: "img-p",
      page: 1,
      box: { x: 72, y: 200, width: 100, height: 80 },
      width: 100,
      height: 80,
      altText: "IMG_2034.jpg",
      decorative: false
    }
  ];
  parsed.pages[0].linkItems = [
    {
      id: "lnk-p",
      page: 1,
      box: { x: 72, y: 240, width: 70, height: 14 },
      url: "https://example.com",
      text: "click here"
    }
  ];
  parsed.pages[0].tableItems = [
    {
      id: "tbl-p",
      page: 1,
      box: { x: 72, y: 300, width: 180, height: 60 },
      cells: [
        { id: "pc1", row: 0, col: 0, text: "A", header: true },
        { id: "pc2", row: 0, col: 1, text: "B", header: true },
        { id: "pc3", row: 1, col: 0, text: "1", header: false },
        { id: "pc4", row: 1, col: 1, text: "2", header: false }
      ]
    }
  ];
  parsed.pages[0].listItems = [];
  parsed.forms = [];
  return parsed;
})();
