# LinkedIn VoiceOver Scripts: PDF Accessibility Remediator

---

## VERSION 2 — 45-Second Demo Script
*(~115 words · synced to on-screen actions)*

---

**[0:00–0:05 — drag PDF into the upload zone]**

I'm dropping a PDF into our accessibility remediator.
It immediately starts auditing the document against 25 accessibility rules — all mapped to WCAG 2.1 AA.

---

**[0:06–0:16 — audit score and violations list appear]**

Here's the result. This document scored a 32 out of 100.
It has no structural tagging — meaning a screen reader can't distinguish a heading from a paragraph.
It has images with no alt text, and missing language metadata.
Each violation is flagged by severity and tells you exactly what's wrong.

---

**[0:17–0:28 — remediation runs, progress indicator, finishes]**

Now watch the remediation.

The tool automatically injects a semantic structure into the PDF — headings, paragraphs, lists, tables — the underlying architecture that assistive technology depends on.
It adds metadata, sets the document language, and if the document is scanned, it runs OCR to make the text readable.

---

**[0:29–0:38 — side-by-side before/after, score jumps]**

Score went from 32 to 71 — automatically.

Left is the original, right is the remediated file. You can download it directly.

---

**[0:39–0:45 — manual action items list]**

But here's what's honest about this tool:
it tells you what it *couldn't* fix — missing alt text, ambiguous link text — and exactly what to do next.

Automation handles the structure. Humans handle the meaning.

---

## DELIVERY NOTES (45-sec version)

- **Word count:** ~115 words — keep your pace natural, not rushed. 45 seconds is tight but comfortable at a conversational clip.
- **Don't narrate the obvious.** If the score is visibly jumping on screen, let the viewer see it for a beat before you say it.
- **"Automation handles the structure. Humans handle the meaning."** — Land this line. Pause briefly before it. It's the thesis of the whole demo.
- **Screen recording tip:** Pre-upload the PDF so it's ready to drag in the moment you start recording. Avoid any dead air waiting for the tool to load.

---

---

## VERSION 1 — Full-Length Script (~2:30–3:00)

**Target audience:** Broad professional audience — accessibility advocates, higher ed IT, web/document managers, compliance officers, and curious technologists.
**Format:** Screen recording demo with voiceover narration
**Tone:** Confident, honest, grounded — not hype

---

## SCRIPT

---

**[OPENING — over a screen showing an inaccessible PDF being uploaded]**

Every day, organizations publish PDFs that millions of people with disabilities simply can't use.

Screen readers can't parse them. They have no logical structure. Images have no descriptions. Scanned pages are just pictures — invisible to assistive technology.

Making those documents accessible has traditionally meant hours of manual work in Adobe Acrobat — per document. That's not scalable.

---

**[CUT TO — the tool loading in the browser, a PDF being dropped into the upload zone]**

So we built a browser-based PDF accessibility remediator — and I want to walk you through exactly what it does, and — just as importantly — what it doesn't do.

You start by uploading your PDF. The tool immediately begins analyzing it against more than 25 accessibility rules, each mapped to the WCAG 2.1 AA standard that governs digital accessibility compliance.

---

**[CUT TO — the audit results appearing, showing a score and list of violations]**

Within seconds, you get a score. It starts at 100 and is deducted based on the severity of what it finds.

Critical issues — like a document that has no structural tagging at all — drop the score significantly. So does detecting a scanned document where all the text is actually just an image. Minor issues like missing metadata cost fewer points.

The scoring is designed to reflect real-world impact on users who depend on assistive technology, not just a checkbox count.

---

**[CUT TO — remediation running, progress indicators]**

Now here's where the automation kicks in.

The tool runs a remediation pipeline that makes a series of targeted, structural fixes to the PDF itself.

It injects a semantic tag tree — the behind-the-scenes structure that tells screen readers what's a heading, what's a paragraph, what's a list, what's a table. It adds PDF/UA metadata, sets the document language, and generates bookmarks for long documents so users can navigate them.

For scanned documents — pages that are just images of text — it runs optical character recognition and embeds a searchable text layer directly into the PDF. There's a cloud-based OCR service as the primary path, and a fallback that runs entirely in the browser if the service is unavailable.

If an external PDF validator is configured, the tool can run the remediation up to three times in a loop, checking its own output each pass and selecting the version that shows the most measurable improvement.

---

**[CUT TO — side-by-side comparison of original vs. remediated, before/after scores]**

The result is a side-by-side view. Original on the left, remediated on the right.

You can see the score change — typically a significant jump. You can download the remediated file directly. And you get a SHA-256 hash of both versions so you have a verifiable record of what changed.

---

**[CUT TO — the "What To Do Next" section with manual action items highlighted]**

And this is the part I want to be direct about.

Automation gets you a long way — we typically see 60 to 70 percent of accessibility violations resolved automatically. But there is a ceiling.

The tool cannot write meaningful alt text for your images. It doesn't know what a chart is showing, or what a photo represents. It can flag that alt text is missing or looks like a filename — and it does — but a human needs to write it.

It can flag links that say "click here" or "read more," but it can't rewrite them in context.

Complex table header relationships, reading order in multi-column layouts, color contrast decisions that require design changes — these still require human judgment.

So the tool generates a prioritized list of what's left to do: the manual fixes most likely to move the needle toward full compliance, ordered by impact.

---

**[CUT TO — speaking to camera or closing slide]**

Accessibility remediation is not a fully solvable problem with today's automation. But most of the tedious, structural, rule-based work can be handled programmatically — and that's exactly what this tool does.

It handles the 70 percent so your team can focus their time on the 30 percent that actually requires human understanding.

If your organization publishes PDFs — and most do — I'd love to connect and talk about how this fits into a broader accessibility workflow.

---

## NOTES FOR DELIVERY

- **Pace:** Speak slowly and deliberately — technical content needs time to land.
- **Pauses:** Hold for 1–2 seconds on key transitions (score reveal, remediation start, "What To Do Next" section).
- **Tone shift:** The manual limitations section should feel honest and grounded — not apologetic. Frame it as "here's what good engineering looks like: knowing your limits."
- **Total runtime estimate:** ~2:30–3:00 minutes at a measured pace, which fits the LinkedIn video sweet spot.

## OPTIONAL ADDITIONS (if you want to go slightly longer)

You can add a line about the technical stack for a more technical-leaning audience:

> *"The stack is Next.js and TypeScript in the browser, pdf-lib for PDF manipulation, Tesseract for in-browser OCR, and optionally OCRmyPDF and veraPDF for server-side validation. Everything runs rules-based — no large language models, no generative AI — which means results are deterministic and reproducible."*

Or a UC San Diego context line:

> *"This was built for UC San Diego's document publishing workflow, where staff regularly publish PDFs to the web and needed a scalable first-pass remediation step before manual review."*
