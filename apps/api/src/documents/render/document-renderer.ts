// Owns DOCX assembly and PlantUML image embedding for generated document artifacts.
import {
  AlignmentType,
  Document,
  HeadingLevel,
  ImageRun,
  LineRuleType,
  Packer,
  Paragraph,
  Table,
  TableCell,
  TableOfContents,
  TableRow,
  TextRun,
  WidthType,
  type IStylesOptions,
} from "docx";
import {
  type DocumentKind,
  type DocumentSection,
  type UmlDiagramKind,
} from "@uml-platform/contracts";
import { documentDiagramLabel, documentTitle } from "../context/document-context.js";
import { type PngRenderClient } from "../../adapters/render/png-render-client.js";
import { numberDocumentSections } from "./document-numbering.js";
import {
  resolveDocumentStyle,
  type ResolvedDocumentStyle,
  type ResolvedParagraphStyle,
} from "./document-style-preset.js";

function ptToHalfPoints(value: number) {
  return Math.round(value * 2);
}

function ptToTwips(value: number) {
  return Math.round(value * 20);
}

function lineSpacingToTwips(style: ResolvedParagraphStyle) {
  return Math.round(240 * style.lineSpacing.value);
}

function firstLineIndentToTwips(style: ResolvedParagraphStyle) {
  return Math.round(style.sizePt * style.firstLineIndentChars * 20);
}

function fontForStyle(style: ResolvedParagraphStyle) {
  return {
    ascii: style.asciiFont,
    hAnsi: style.asciiFont,
    eastAsia: style.eastAsiaFont,
  };
}

function spacingForStyle(style: ResolvedParagraphStyle) {
  return {
    before: ptToTwips(style.spacingBeforePt),
    after: ptToTwips(style.spacingAfterPt),
    line: lineSpacingToTwips(style),
    lineRule: LineRuleType.AUTO,
  };
}

function createTextRun(text: string, style: ResolvedParagraphStyle, bold = style.bold) {
  return new TextRun({
    text,
    bold,
    italics: style.italic,
    font: fontForStyle(style),
    size: ptToHalfPoints(style.sizePt),
  });
}

function createDocumentStyles(style: ResolvedDocumentStyle): IStylesOptions {
  const headingStyle = (heading: ResolvedDocumentStyle["heading1"]) => ({
    run: {
      bold: heading.bold,
      italics: heading.italic,
      font: fontForStyle(heading),
      size: ptToHalfPoints(heading.sizePt),
    },
    paragraph: {
      spacing: spacingForStyle(heading),
      keepNext: heading.keepNext,
    },
  });

  return {
    default: {
      document: {
        run: {
          font: fontForStyle(style.body),
          size: ptToHalfPoints(style.body.sizePt),
        },
        paragraph: {
          spacing: spacingForStyle(style.body),
        },
      },
      heading1: headingStyle(style.heading1),
      heading2: headingStyle(style.heading2),
      heading3: headingStyle(style.heading3),
    },
  };
}

function createTextParagraph(text: string, style: ResolvedParagraphStyle) {
  return new Paragraph({
    children: [createTextRun(text, style)],
    indent: { firstLine: firstLineIndentToTwips(style) },
    spacing: spacingForStyle(style),
  });
}

function createHeadingParagraph(
  section: DocumentSection,
  style: ResolvedDocumentStyle,
  pageBreakBefore = false,
) {
  const heading =
    section.level === 1
      ? HeadingLevel.HEADING_1
      : section.level === 2
        ? HeadingLevel.HEADING_2
        : HeadingLevel.HEADING_3;
  const headingStyle =
    section.level === 1 ? style.heading1 : section.level === 2 ? style.heading2 : style.heading3;
  return new Paragraph({
    children: [createTextRun(section.title, headingStyle)],
    heading,
    pageBreakBefore,
    spacing: spacingForStyle(headingStyle),
    keepNext: headingStyle.keepNext,
  });
}

function createSimpleTable(section: DocumentSection, style: ResolvedDocumentStyle) {
  if (!section.table) return null;
  const rows = [section.table.headers, ...section.table.rows].map(
    (cells, rowIndex) =>
      new TableRow({
        children: cells.map(
          (cell) =>
            new TableCell({
              children: [
                new Paragraph({
                  children: [
                    createTextRun(
                      cell || " ",
                      style.table,
                      rowIndex === 0 ? style.table.headerBold : style.table.bold,
                    ),
                  ],
                  spacing: spacingForStyle(style.table),
                }),
              ],
            }),
        ),
      }),
  );
  return new Table({
    width: { size: 100, type: WidthType.PERCENTAGE },
    rows,
  });
}

function createPngImageParagraph(png: Buffer, title: string) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new ImageRun({
        type: "png",
        data: png,
        transformation: {
          width: 560,
          height: 320,
        },
        altText: {
          title,
          description: title,
          name: title,
        },
      }),
    ],
    spacing: { before: 120, after: 120 },
  });
}

function createFigureCaption(text: string, style: ResolvedDocumentStyle) {
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [createTextRun(text, style.caption)],
    spacing: spacingForStyle(style.caption),
  });
}

function createCoverParagraph(
  text: string,
  style: ResolvedDocumentStyle,
  options?: { title?: boolean; subtitle?: boolean },
) {
  const baseStyle = options?.title || options?.subtitle ? style.heading1 : style.body;
  return new Paragraph({
    alignment: AlignmentType.CENTER,
    children: [
      new TextRun({
        text,
        bold: Boolean(options?.title || options?.subtitle),
        font: fontForStyle(baseStyle),
        size: ptToHalfPoints(options?.title ? 18 : options?.subtitle ? 15 : style.body.sizePt),
      }),
    ],
    spacing: { before: options?.title ? 1200 : 160, after: options?.title ? 520 : 220 },
  });
}

function createDocumentCover(documentKind: DocumentKind, style: ResolvedDocumentStyle) {
  const generatedDate = new Date().toISOString().slice(0, 10);
  return [
    createCoverParagraph("课程设计文档", style, { title: true }),
    createCoverParagraph(documentTitle(documentKind), style, { subtitle: true }),
    createCoverParagraph("项目名称：待填写", style),
    createCoverParagraph(`文档类型：${documentTitle(documentKind)}`, style),
    createCoverParagraph(`生成日期：${generatedDate}`, style),
  ];
}

function estimateTocEntries(sections: DocumentSection[]) {
  let page = 1;
  let pageUnits = 0;
  const entries: Array<{ title: string; level: number; page: number }> = [];

  for (const section of sections) {
    entries.push({ title: section.title, level: section.level, page });
    pageUnits += section.level === 1 ? 4 : section.level === 2 ? 3 : 2;
    pageUnits += Math.max(section.body.length, 1) * 2;
    if (section.table) {
      pageUnits += 3 + section.table.rows.length;
    }
    if (section.diagramKind) {
      pageUnits += 8;
    }
    while (pageUnits >= 18) {
      page += 1;
      pageUnits -= 18;
    }
  }

  return entries;
}

function createTableOfContents(style: ResolvedDocumentStyle, sections: DocumentSection[]) {
  return [
    new Paragraph({
      children: [createTextRun("目录", style.heading1)],
      alignment: AlignmentType.CENTER,
      pageBreakBefore: true,
      spacing: spacingForStyle(style.heading1),
    }),
    // Cached entries make the TOC visible immediately; Word/WPS can refresh the
    // dirty field later to replace the estimated page numbers with exact ones.
    new TableOfContents("目录", {
      hyperlink: true,
      headingStyleRange: "1-3",
      cachedEntries: estimateTocEntries(sections),
      beginDirty: true,
    }),
  ];
}

export async function renderDocumentBuffer(
  documentKind: DocumentKind,
  sections: DocumentSection[],
  plantUmlMap: Map<string, string>,
  svgKinds: Set<string>,
  pngRenderClient: PngRenderClient,
  missingArtifacts: string[],
  documentStyleSettings?: Parameters<typeof resolveDocumentStyle>[0],
) {
  // This is the document assembly boundary: callers provide normalized sections
  // and image sources; this module returns a DOCX buffer plus missing-image notes.
  const style = resolveDocumentStyle(documentStyleSettings);
  const renderedSections = style.autoNumberHeadings
    ? numberDocumentSections(sections)
    : sections;
  const frontMatterChildren: Array<Paragraph | Table | TableOfContents> = createDocumentCover(
    documentKind,
    style,
  );

  if (style.includeTableOfContents) {
    frontMatterChildren.push(...createTableOfContents(style, renderedSections));
  }

  const bodyChildren: Array<Paragraph | Table | TableOfContents> = [];
  for (const [index, section] of renderedSections.entries()) {
    bodyChildren.push(createHeadingParagraph(section, style, index === 0));
    for (const paragraph of section.body) {
      bodyChildren.push(createTextParagraph(paragraph, style.body));
    }
    const table = createSimpleTable(section, style);
    if (table) {
      bodyChildren.push(table);
    }
    if (section.diagramKind) {
      const source = plantUmlMap.get(section.diagramKind);
      if (!source) {
        const reason = svgKinds.has(section.diagramKind)
          ? `${section.diagramKind}: 缺少可嵌入图片源`
          : section.diagramKind;
        missingArtifacts.push(reason);
        bodyChildren.push(createTextParagraph("当前未生成该图。", style.body));
        continue;
      }

      try {
        const rendered = await pngRenderClient({
          diagramKind: section.diagramKind as UmlDiagramKind,
          source,
        });
        bodyChildren.push(createPngImageParagraph(rendered.png, section.title));
        bodyChildren.push(
          createFigureCaption(
            `图 ${documentDiagramLabel(section.diagramKind, section.title)}`,
            style,
          ),
        );
      } catch (error) {
        missingArtifacts.push(
          `${section.diagramKind}: ${error instanceof Error ? error.message : "图片渲染失败"}`,
        );
        bodyChildren.push(createTextParagraph("当前未生成该图。", style.body));
      }
    }
  }

  const doc = new Document({
    styles: createDocumentStyles(style),
    features: {
      updateFields: true,
    },
    sections: [
      {
        properties: {
          page: {
            margin: {
              top: style.page.marginTop,
              right: style.page.marginRight,
              bottom: style.page.marginBottom,
              left: style.page.marginLeft,
            },
          },
        },
        children: frontMatterChildren,
      },
      {
        properties: {
          page: {
            margin: {
              top: style.page.marginTop,
              right: style.page.marginRight,
              bottom: style.page.marginBottom,
              left: style.page.marginLeft,
            },
            pageNumbers: {
              start: 1,
            },
          },
        },
        children: bodyChildren,
      },
    ],
  });

  return Packer.toBuffer(doc);
}
