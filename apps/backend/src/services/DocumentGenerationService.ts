import { PrismaClient } from '.prisma/client';
import { TRPCError } from '@trpc/server';
import PDFDocument from 'pdfkit';
import { Document, Packer, Paragraph, TextRun, HeadingLevel } from 'docx';
import fs from 'fs';
import path from 'path';

export interface ExportOptions {
  includeCanvas: boolean;
  includeAnswers: boolean;
  includeVersions: boolean;
  customSections?: string[];
}

export interface DocumentSection {
  title: string;
  content: string;
  order: number;
  type: 'text' | 'canvas' | 'answers' | 'metadata';
}

export class DocumentGenerationService {
  private prisma: PrismaClient;

  constructor(prisma: PrismaClient) {
    this.prisma = prisma;
  }

  async generateDocument(
    sessionId: string,
    templateId: string,
    format: 'PDF' | 'DOCX' | 'HTML',
    options: ExportOptions = {
      includeCanvas: true,
      includeAnswers: true,
      includeVersions: false
    }
  ): Promise<{ filePath: string; fileName: string }> {
    // Get session data
    const session = await this.prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        user: true,
        answers: {
          include: {
            question: true
          }
        },
        canvas: {
          include: {
            elements: true
          }
        },
        versions: options.includeVersions
          ? {
              orderBy: { createdAt: 'desc' },
              take: 5
            }
          : false
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // Get template
    const template = await this.prisma.template.findUnique({
      where: { id: templateId }
    });

    if (!template) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Template not found'
      });
    }

    // Generate document sections
    const sections = await this.generateDocumentSections(
      session,
      template,
      options
    );

    // Generate the document based on format
    let filePath: string;
    let fileName: string;

    switch (format) {
      case 'PDF':
        ({ filePath, fileName } = await this.generatePDF(
          session,
          template,
          sections
        ));
        break;
      case 'DOCX':
        ({ filePath, fileName } = await this.generateDOCX(
          session,
          template,
          sections
        ));
        break;
      case 'HTML':
        ({ filePath, fileName } = await this.generateHTML(
          session,
          template,
          sections
        ));
        break;
      default:
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unsupported export format'
        });
    }

    return { filePath, fileName };
  }

  private async generateDocumentSections(
    session: any,
    template: any,
    options: ExportOptions
  ): Promise<DocumentSection[]> {
    const sections: DocumentSection[] = [];

    // Title section
    sections.push({
      title: 'Document Title',
      content: `${session.title} - Design Document`,
      order: 0,
      type: 'text'
    });

    // Metadata section
    sections.push({
      title: 'Session Information',
      content: `
Category: ${session.category}
Status: ${session.status}
Created: ${session.createdAt.toDateString()}
Updated: ${session.updatedAt.toDateString()}
User: ${session.user.name || session.user.email}
      `.trim(),
      order: 1,
      type: 'metadata'
    });

    // Answers section
    if (options.includeAnswers && session.answers?.length > 0) {
      const answersContent = session.answers
        .map((answer: any) =>
          `
Q: ${answer.question.content}
A: ${answer.content}
        `.trim()
        )
        .join('\n\n');

      sections.push({
        title: 'Questions and Answers',
        content: answersContent,
        order: 2,
        type: 'answers'
      });
    }

    // Canvas section
    if (options.includeCanvas && session.canvas) {
      let canvasContent = 'Canvas Elements:\n';

      if (session.canvas.elements?.length > 0) {
        canvasContent += session.canvas.elements
          .map(
            (element: any) =>
              `- ${element.type}: ${element.properties ? JSON.stringify(element.properties) : 'No properties'}`
          )
          .join('\n');
      } else {
        canvasContent += 'No canvas elements found.';
      }

      sections.push({
        title: 'Design Canvas',
        content: canvasContent,
        order: 3,
        type: 'canvas'
      });
    }

    // Version history section
    if (options.includeVersions && session.versions?.length > 0) {
      const versionsContent = session.versions
        .map((version: any) =>
          `
Version ${version.version}: ${version.description || 'No description'}
Created: ${version.createdAt.toDateString()}
        `.trim()
        )
        .join('\n\n');

      sections.push({
        title: 'Version History',
        content: versionsContent,
        order: 4,
        type: 'text'
      });
    }

    // Custom sections from template
    if (template.content && typeof template.content === 'object') {
      const templateSections = (template.content as any).sections || [];
      templateSections.forEach((section: any, index: number) => {
        sections.push({
          title: section.title || `Custom Section ${index + 1}`,
          content: section.content || '',
          order: 10 + index,
          type: 'text'
        });
      });
    }

    return sections.sort((a, b) => a.order - b.order);
  }

  private async generatePDF(
    session: any,
    template: any,
    sections: DocumentSection[]
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.pdf`;
    const filePath = path.join(process.cwd(), 'exports', fileName);

    // Ensure exports directory exists
    const exportsDir = path.dirname(filePath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const doc = new PDFDocument();
    const stream = fs.createWriteStream(filePath);
    doc.pipe(stream);

    // Add content sections
    sections.forEach((section, index) => {
      if (index > 0) {
        doc.addPage();
      }

      // Add section title
      doc.fontSize(18).text(section.title, { underline: true });
      doc.moveDown();

      // Add section content
      doc.fontSize(12).text(section.content);
      doc.moveDown();
    });

    doc.end();

    // Wait for the PDF to be written
    await new Promise((resolve, reject) => {
      stream.on('finish', resolve);
      stream.on('error', reject);
    });

    return { filePath, fileName };
  }

  private async generateDOCX(
    session: any,
    template: any,
    sections: DocumentSection[]
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.docx`;
    const filePath = path.join(process.cwd(), 'exports', fileName);

    // Ensure exports directory exists
    const exportsDir = path.dirname(filePath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const children = [];

    sections.forEach((section) => {
      // Add section title
      children.push(
        new Paragraph({
          heading: HeadingLevel.HEADING_1,
          children: [new TextRun({ text: section.title, bold: true })]
        })
      );

      // Add section content
      const contentLines = section.content.split('\n');
      contentLines.forEach((line) => {
        children.push(
          new Paragraph({
            children: [new TextRun({ text: line })]
          })
        );
      });

      // Add spacing
      children.push(new Paragraph({ children: [new TextRun({ text: '' })] }));
    });

    const doc = new Document({
      sections: [
        {
          properties: {},
          children
        }
      ]
    });

    const buffer = await Packer.toBuffer(doc);
    fs.writeFileSync(filePath, buffer);

    return { filePath, fileName };
  }

  private async generateHTML(
    session: any,
    template: any,
    sections: DocumentSection[]
  ): Promise<{ filePath: string; fileName: string }> {
    const fileName = `${session.title.replace(/[^a-zA-Z0-9]/g, '_')}_${Date.now()}.html`;
    const filePath = path.join(process.cwd(), 'exports', fileName);

    // Ensure exports directory exists
    const exportsDir = path.dirname(filePath);
    if (!fs.existsSync(exportsDir)) {
      fs.mkdirSync(exportsDir, { recursive: true });
    }

    const htmlContent = `
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>${session.title} - Design Document</title>
    <style>
        body {
            font-family: Arial, sans-serif;
            max-width: 800px;
            margin: 0 auto;
            padding: 20px;
            line-height: 1.6;
        }
        h1 {
            color: #333;
            border-bottom: 2px solid #007acc;
            padding-bottom: 10px;
        }
        h2 {
            color: #555;
            margin-top: 30px;
            margin-bottom: 15px;
        }
        .metadata {
            background-color: #f5f5f5;
            padding: 15px;
            border-radius: 5px;
            margin-bottom: 20px;
        }
        .section {
            margin-bottom: 30px;
        }
        pre {
            background-color: #f8f8f8;
            padding: 15px;
            border-radius: 5px;
            overflow-x: auto;
        }
    </style>
</head>
<body>
    <h1>${session.title} - Design Document</h1>

    ${sections
      .map(
        (section) => `
    <div class="section">
        <h2>${section.title}</h2>
        <div class="${section.type}">
            <pre>${section.content}</pre>
        </div>
    </div>
    `
      )
      .join('')}

    <footer style="margin-top: 50px; padding-top: 20px; border-top: 1px solid #ccc; color: #666;">
        Generated on ${new Date().toDateString()}
    </footer>
</body>
</html>
    `.trim();

    fs.writeFileSync(filePath, htmlContent, 'utf8');

    return { filePath, fileName };
  }

  async generateQuickExport(
    sessionId: string,
    format: 'PDF' | 'DOCX' | 'HTML'
  ): Promise<{ filePath: string; fileName: string }> {
    // Use a default template approach for quick exports
    const session = await this.prisma.designSession.findUnique({
      where: { id: sessionId },
      include: {
        user: true,
        answers: {
          include: {
            question: true
          }
        },
        canvas: {
          include: {
            elements: true
          }
        }
      }
    });

    if (!session) {
      throw new TRPCError({
        code: 'NOT_FOUND',
        message: 'Design session not found'
      });
    }

    // Create a minimal template for quick export
    const quickTemplate = {
      id: 'quick-export',
      name: 'Quick Export Template',
      content: {
        sections: [
          {
            title: 'Overview',
            content: 'This is a quick export of your design session.'
          }
        ]
      }
    };

    const options: ExportOptions = {
      includeCanvas: true,
      includeAnswers: true,
      includeVersions: false
    };

    const sections = await this.generateDocumentSections(
      session,
      quickTemplate,
      options
    );

    switch (format) {
      case 'PDF':
        return await this.generatePDF(session, quickTemplate, sections);
      case 'DOCX':
        return await this.generateDOCX(session, quickTemplate, sections);
      case 'HTML':
        return await this.generateHTML(session, quickTemplate, sections);
      default:
        throw new TRPCError({
          code: 'BAD_REQUEST',
          message: 'Unsupported export format'
        });
    }
  }
}
