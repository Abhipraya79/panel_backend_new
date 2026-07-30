import { Request, Response } from 'express';
import { TelemetryService } from '../services/telemetry.service';
import logger from '../utils/logger';
import * as XLSX from 'xlsx';
import PDFDocument from 'pdfkit';
import { format as dateFormat } from 'date-fns';

/**
 * Helper: format a number value safely
 */
function fmt(val: any, decimals = 2): string {
  const n = parseFloat(val);
  if (isNaN(n)) return '0.00';
  return n.toFixed(decimals);
}

function boolStr(val: any): string {
  if (val === true || val === 1 || val === '1' || val === 'true' || val === 'ON') return 'ON';
  return 'OFF';
}

function modeStr(val: any): string {
  return String(val || 'MANUAL').toUpperCase();
}

function formatTimestamp(ts: any): Date {
  if (!ts) return new Date();
  if (ts instanceof Date) return ts;
  const d = new Date(ts);
  return isNaN(d.getTime()) ? new Date() : d;
}

/**
 * GET /api/export/excel
 *
 * Query params:
 *   date     : 'today' | 'yesterday' | ISO date string (default: 'today')
 *   interval : '3s' | '5m' (default: '3s')
 *   deviceId : string (optional)
 *   search   : string (optional)
 */
export const exportExcel = async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || 'today';
    const interval = ((req.query.interval as string) === '5m' ? '5m' : '3s') as '3s' | '5m';
    const deviceId = (req.query.deviceId as string) || undefined;
    const search = (req.query.search as string) || undefined;

    logger.info(`[EXPORT] Excel request — date=${date} interval=${interval}`);

    const records = await TelemetryService.getAllForExport({ date, interval, deviceId, search });

    const workbook = XLSX.utils.book_new();

    // Header row
    const headers = [
      'No', 'Tanggal', 'Jam', 'Suhu Panel (°C)', 'Suhu Air (°C)',
      'Tegangan (V)', 'Arus (A)', 'Daya (W)', 'Debu', 'PWM Value',
      'Cooling', 'Cleaning', 'Mode', 'Status', 'Device ID',
    ];

    const rows: any[][] = [headers];
    records.forEach((r, i) => {
      const ts = formatTimestamp(r.receivedAt ?? r.timestamp);
      rows.push([
        i + 1,
        dateFormat(ts, 'dd MMM yyyy'),
        dateFormat(ts, 'HH:mm:ss'),
        parseFloat(fmt(r.temperature)),
        parseFloat(fmt(r.airTemp)),
        parseFloat(fmt(r.voltage)),
        parseFloat(fmt(r.current)),
        parseFloat(fmt(r.power)),
        parseFloat(fmt(r.dust)),
        parseInt(r.pwm_value ?? r.pwmValue ?? 0),
        boolStr(r.pumpStatus ?? r.pump),
        boolStr(r.wiperStatus ?? r.wiper),
        modeStr(r.mode ?? r.systemMode),
        String(r.status ?? r.deviceStatus ?? 'ONLINE').toUpperCase(),
        String(r.deviceId ?? 'panel001'),
      ]);
    });

    const worksheet = XLSX.utils.aoa_to_sheet(rows);

    // Column widths
    worksheet['!cols'] = [
      { wch: 5 }, { wch: 16 }, { wch: 10 }, { wch: 15 }, { wch: 13 },
      { wch: 13 }, { wch: 10 }, { wch: 10 }, { wch: 8 }, { wch: 10 },
      { wch: 9 }, { wch: 10 }, { wch: 9 }, { wch: 9 }, { wch: 12 },
    ];

    XLSX.utils.book_append_sheet(workbook, worksheet, 'Monitoring');

    const buffer = XLSX.write(workbook, { type: 'buffer', bookType: 'xlsx' });
    const filename = `PanelCare_${date}_${interval}_${Date.now()}.xlsx`;

    res.setHeader('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Total-Records', records.length.toString());
    res.send(buffer);

    logger.info(`[EXPORT] Excel sent: ${records.length} rows, filename=${filename}`);
  } catch (error: any) {
    logger.error('[EXPORT] Excel export failed', { error });
    res.status(500).json({ success: false, message: error.message || 'Export failed' });
  }
};

/**
 * GET /api/export/pdf
 *
 * Same query params as exportExcel.
 */
export const exportPdf = async (req: Request, res: Response): Promise<void> => {
  try {
    const date = (req.query.date as string) || 'today';
    const interval = ((req.query.interval as string) === '5m' ? '5m' : '3s') as '3s' | '5m';
    const deviceId = (req.query.deviceId as string) || undefined;
    const search = (req.query.search as string) || undefined;

    logger.info(`[EXPORT] PDF request — date=${date} interval=${interval}`);

    const records = await TelemetryService.getAllForExport({ date, interval, deviceId, search });

    const filename = `PanelCare_${date}_${interval}_${Date.now()}.pdf`;

    res.setHeader('Content-Type', 'application/pdf');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.setHeader('X-Total-Records', records.length.toString());

    const doc = new PDFDocument({ margin: 30, size: 'A4', layout: 'landscape' });
    doc.pipe(res);

    // ── Title
    doc.fontSize(14).font('Helvetica-Bold').text('Laporan Monitoring Panel Surya', { align: 'center' });
    doc.fontSize(10).font('Helvetica').text(
      `Tanggal: ${date} | Interval: ${interval === '5m' ? '5 Menit' : '3 Detik'} | Total Data: ${records.length}`,
      { align: 'center' },
    );
    doc.moveDown(0.5);
    doc.fontSize(9).text(
      `Digenerate: ${dateFormat(new Date(), 'dd MMM yyyy HH:mm:ss')}`,
      { align: 'right' },
    );
    doc.moveDown(1);

    // ── Table setup
    const cols = [
      { header: 'No', width: 28 },
      { header: 'Tanggal', width: 68 },
      { header: 'Jam', width: 52 },
      { header: 'Suhu Panel', width: 52 },
      { header: 'Suhu Air', width: 48 },
      { header: 'Tegangan', width: 48 },
      { header: 'Arus', width: 40 },
      { header: 'Daya', width: 40 },
      { header: 'Debu', width: 40 },
      { header: 'PWM', width: 36 },
      { header: 'Cooling', width: 42 },
      { header: 'Cleaning', width: 46 },
      { header: 'Mode', width: 46 },
      { header: 'Status', width: 46 },
    ];

    const startX = doc.page.margins.left;
    const rowH = 16;
    const headerH = 18;
    const fontSize = 7;

    const drawRow = (y: number, values: string[], isHeader: boolean) => {
      let x = startX;
      doc.fontSize(fontSize);
      cols.forEach((col, i) => {
        if (isHeader) {
          doc.rect(x, y, col.width, headerH).fill('#E91E63');
          doc.fillColor('white').font('Helvetica-Bold');
        } else {
          const bg = i % 2 === 0 ? '#FFF8FB' : '#FFFFFF';
          doc.rect(x, y, col.width, rowH).fill(bg);
          doc.fillColor('#212121').font('Helvetica');
        }
        doc.text(values[i] || '', x + 2, y + (isHeader ? 5 : 4), {
          width: col.width - 4,
          ellipsis: true,
          lineBreak: false,
        });
        x += col.width;
      });
    };

    // Draw header
    let currentY = doc.y;
    const headers = cols.map((c) => c.header);
    drawRow(currentY, headers, true);
    currentY += headerH;

    // Draw rows — paginate if needed
    records.forEach((r, i) => {
      if (currentY + rowH > doc.page.height - doc.page.margins.bottom - 20) {
        doc.addPage();
        currentY = doc.page.margins.top;
        // Re-draw header on new page
        drawRow(currentY, headers, true);
        currentY += headerH;
      }

      const ts = formatTimestamp(r.receivedAt ?? r.timestamp);
      const values = [
        String(i + 1),
        dateFormat(ts, 'dd/MM/yyyy'),
        dateFormat(ts, 'HH:mm:ss'),
        fmt(r.temperature),
        fmt(r.airTemp),
        fmt(r.voltage),
        fmt(r.current),
        fmt(r.power),
        fmt(r.dust),
        String(r.pwm_value ?? r.pwmValue ?? 0),
        boolStr(r.pumpStatus ?? r.pump),
        boolStr(r.wiperStatus ?? r.wiper),
        modeStr(r.mode ?? r.systemMode),
        String(r.status ?? r.deviceStatus ?? 'ONLINE').toUpperCase(),
      ];

      drawRow(currentY, values, false);
      currentY += rowH;
    });

    doc.end();
    logger.info(`[EXPORT] PDF sent: ${records.length} rows, filename=${filename}`);
  } catch (error: any) {
    logger.error('[EXPORT] PDF export failed', { error });
    if (!res.headersSent) {
      res.status(500).json({ success: false, message: error.message || 'Export failed' });
    }
  }
};
