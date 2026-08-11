import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import type { PayslipBreakdown, PayslipLineItem } from "@hrm/types";

const MONTH_NAMES = [
  "January", "February", "March", "April", "May", "June",
  "July", "August", "September", "October", "November", "December",
];

export interface PayslipPdfInput {
  tenantName: string;
  employeeName: string;
  employeeCode: string;
  periodMonth: number;
  periodYear: number;
  grossEarnings: number;
  totalDeductions: number;
  netPay: number;
  breakdown: PayslipBreakdown;
}

function formatAmount(n: number): string {
  return n.toLocaleString("en-IN", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

/** Renders a simple one-page payslip. Not a design deliverable — a real, readable PDF is the bar, not a polished template. */
export async function generatePayslipPdf(input: PayslipPdfInput): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const page = doc.addPage([595.28, 841.89]); // A4
  const font = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);

  const left = 50;
  const amountX = 420;
  let y = 790;

  const text = (value: string, opts: { size?: number; bold?: boolean; color?: [number, number, number] } = {}) => {
    page.drawText(value, {
      x: left,
      y,
      font: opts.bold ? bold : font,
      size: opts.size ?? 10,
      ...(opts.color ? { color: rgb(...opts.color) } : {}),
    });
  };

  const row = (label: string, amount: number, opts: { bold?: boolean } = {}) => {
    page.drawText(label, { x: left, y, font: opts.bold ? bold : font, size: 10 });
    page.drawText(formatAmount(amount), { x: amountX, y, font: opts.bold ? bold : font, size: 10 });
    y -= 15;
  };

  const section = (title: string, lines: PayslipLineItem[]) => {
    text(title, { bold: true, size: 12 });
    y -= 18;
    if (lines.length === 0) {
      text("(none)", { color: [0.5, 0.5, 0.5] });
      y -= 15;
    } else {
      for (const line of lines) row(line.label, line.amount);
    }
    y -= 8;
  };

  text(input.tenantName, { bold: true, size: 16 });
  y -= 22;
  text(`Payslip for ${MONTH_NAMES[input.periodMonth - 1]} ${input.periodYear}`, { size: 12 });
  y -= 18;
  text(`${input.employeeName} (${input.employeeCode})`);
  y -= 14;
  text(`Working days: ${input.breakdown.workingDays}   Loss of pay days: ${input.breakdown.lopDays}`, { color: [0.3, 0.3, 0.3] });
  y -= 26;

  section("Earnings", input.breakdown.earnings);
  section("Statutory Deductions", input.breakdown.statutoryDeductions);
  section("Other Deductions", input.breakdown.otherDeductions);

  y -= 6;
  page.drawLine({ start: { x: left, y }, end: { x: amountX + 90, y }, thickness: 0.5, color: rgb(0.7, 0.7, 0.7) });
  y -= 20;

  row("Gross Earnings", input.grossEarnings, { bold: true });
  row("Total Deductions", input.totalDeductions, { bold: true });
  y -= 6;
  row("Net Pay", input.netPay, { bold: true });

  if (input.breakdown.employerContributions.length > 0) {
    y -= 20;
    text("Employer Contributions (informational — not deducted from net pay)", { size: 9, color: [0.5, 0.5, 0.5] });
    y -= 14;
    for (const line of input.breakdown.employerContributions) {
      page.drawText(line.label, { x: left, y, font, size: 9, color: rgb(0.5, 0.5, 0.5) });
      page.drawText(formatAmount(line.amount), { x: amountX, y, font, size: 9, color: rgb(0.5, 0.5, 0.5) });
      y -= 13;
    }
  }

  return doc.save();
}
