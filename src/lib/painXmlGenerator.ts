function escapeXml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

/**
 * Normalize an extracted amount string to a two-decimal number string.
 * Handles: "1.234,56" (EU), "1,234.56" (US), "1234.56", "€ 1.234,56", etc.
 */
export function normalizeAmount(raw: string): string {
  // Strip currency symbols, whitespace, letters
  let cleaned = raw.replace(/[^\d.,-]/g, '');
  if (!cleaned) return '0.00';

  // Determine decimal separator:
  // If both . and , exist, the last one is the decimal separator
  const lastDot = cleaned.lastIndexOf('.');
  const lastComma = cleaned.lastIndexOf(',');

  if (lastDot > -1 && lastComma > -1) {
    if (lastComma > lastDot) {
      // EU format: 1.234,56 → remove dots, replace comma with dot
      cleaned = cleaned.replace(/\./g, '').replace(',', '.');
    } else {
      // US format: 1,234.56 → remove commas
      cleaned = cleaned.replace(/,/g, '');
    }
  } else if (lastComma > -1) {
    // Could be "1234,56" (decimal) or "1,234" (thousands)
    // If exactly 2 digits after comma, treat as decimal
    const afterComma = cleaned.length - lastComma - 1;
    if (afterComma === 1 || afterComma === 2) {
      cleaned = cleaned.replace(',', '.');
    } else {
      cleaned = cleaned.replace(/,/g, '');
    }
  }

  const num = parseFloat(cleaned);
  if (isNaN(num)) return '0.00';
  return num.toFixed(2);
}

/**
 * Attempt to parse a date string into YYYY-MM-DD format.
 * Handles: DD.MM.YYYY, DD/MM/YYYY, DD-MM-YYYY, YYYY-MM-DD.
 * Falls back to raw string if unrecognized.
 */
export function parseDateToYMD(raw: string): string {
  const trimmed = raw.trim();

  // Already YYYY-MM-DD
  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) return trimmed;

  // DD.MM.YYYY or DD/MM/YYYY or DD-MM-YYYY
  const match = trimmed.match(/^(\d{1,2})[.\-/](\d{1,2})[.\-/](\d{4})$/);
  if (match) {
    const [, dd, mm, yyyy] = match;
    return `${yyyy}-${mm.padStart(2, '0')}-${dd.padStart(2, '0')}`;
  }

  return trimmed;
}

export interface Pain001Transaction {
  beneficiaryName: string;
  beneficiaryIban: string;
  amount: string;
  referenceNumber?: string;
  paymentDescription: string;
  dueDate: string;
}

export interface Pain001Params extends Pain001Transaction {
  payerName: string;
  payerIban: string;
  payerBic: string;
  currency: string;
  identifier: string;
}

export interface Pain001MultiParams {
  payerName: string;
  payerIban: string;
  payerBic: string;
  currency: string;
  identifier: string;
  transactions: Pain001Transaction[];
}

export function generatePain001(params: Pain001Params): string {
  const now = new Date();
  const msgId = `${params.identifier}-${now.getTime()}`;
  const pmtInfId = `PMT-${now.getTime()}`;
  const creDtTm = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const amount = normalizeAmount(params.amount);
  const reqExctnDt = parseDateToYMD(params.dueDate);
  const endToEndId = params.referenceNumber?.trim() || `E2E-${now.getTime()}`;
  const ccy = params.currency || 'EUR';

  let rmtInf = `      <RmtInf>\n`;
  rmtInf += `        <Ustrd>${escapeXml(params.paymentDescription)}</Ustrd>\n`;
  if (params.referenceNumber?.trim()) {
    rmtInf += `        <Strd>\n`;
    rmtInf += `          <CdtrRefInf>\n`;
    rmtInf += `            <Ref>${escapeXml(params.referenceNumber.trim())}</Ref>\n`;
    rmtInf += `          </CdtrRefInf>\n`;
    rmtInf += `        </Strd>\n`;
  }
  rmtInf += `      </RmtInf>`;

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amount}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(params.payerName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>1</NbOfTxs>
      <CtrlSum>${amount}</CtrlSum>
      <ReqdExctnDt>
        <Dt>${reqExctnDt}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(params.payerName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(params.payerIban)}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${escapeXml(params.payerBic)}</BICFI>
        </FinInstnId>
      </DbtrAgt>
      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${escapeXml(ccy)}">${amount}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId/>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(params.beneficiaryName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(params.beneficiaryIban)}</IBAN>
          </Id>
        </CdtrAcct>
${rmtInf}
      </CdtTrfTxInf>
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}

function buildCdtTrfTxInf(tx: Pain001Transaction, index: number, ccy: string, now: Date): string {
  const amount = normalizeAmount(tx.amount);
  const endToEndId = tx.referenceNumber?.trim() || `E2E-${now.getTime()}-${index}`;

  let rmtInf = `      <RmtInf>\n`;
  rmtInf += `        <Ustrd>${escapeXml(tx.paymentDescription)}</Ustrd>\n`;
  if (tx.referenceNumber?.trim()) {
    rmtInf += `        <Strd>\n`;
    rmtInf += `          <CdtrRefInf>\n`;
    rmtInf += `            <Ref>${escapeXml(tx.referenceNumber.trim())}</Ref>\n`;
    rmtInf += `          </CdtrRefInf>\n`;
    rmtInf += `        </Strd>\n`;
  }
  rmtInf += `      </RmtInf>`;

  return `      <CdtTrfTxInf>
        <PmtId>
          <EndToEndId>${escapeXml(endToEndId)}</EndToEndId>
        </PmtId>
        <Amt>
          <InstdAmt Ccy="${escapeXml(ccy)}">${amount}</InstdAmt>
        </Amt>
        <CdtrAgt>
          <FinInstnId/>
        </CdtrAgt>
        <Cdtr>
          <Nm>${escapeXml(tx.beneficiaryName)}</Nm>
        </Cdtr>
        <CdtrAcct>
          <Id>
            <IBAN>${escapeXml(tx.beneficiaryIban)}</IBAN>
          </Id>
        </CdtrAcct>
${rmtInf}
      </CdtTrfTxInf>`;
}

export function generatePain001Multi(params: Pain001MultiParams): string {
  const now = new Date();
  const msgId = `${params.identifier}-${now.getTime()}`;
  const pmtInfId = `PMT-${now.getTime()}`;
  const creDtTm = now.toISOString().replace(/\.\d{3}Z$/, 'Z');
  const ccy = params.currency || 'EUR';
  const nbOfTxs = params.transactions.length;

  const amounts = params.transactions.map(tx => parseFloat(normalizeAmount(tx.amount)));
  const ctrlSum = amounts.reduce((sum, a) => sum + a, 0).toFixed(2);

  // Use earliest due date
  const dates = params.transactions
    .map(tx => parseDateToYMD(tx.dueDate))
    .filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d))
    .sort();
  const reqExctnDt = dates[0] ?? parseDateToYMD(params.transactions[0]?.dueDate ?? '');

  const txBlocks = params.transactions
    .map((tx, i) => buildCdtTrfTxInf(tx, i, ccy, now))
    .join('\n');

  return `<?xml version="1.0" encoding="UTF-8"?>
<Document xmlns="urn:iso:std:iso:20022:tech:xsd:pain.001.001.09"
          xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <CstmrCdtTrfInitn>
    <GrpHdr>
      <MsgId>${escapeXml(msgId)}</MsgId>
      <CreDtTm>${creDtTm}</CreDtTm>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <InitgPty>
        <Nm>${escapeXml(params.payerName)}</Nm>
      </InitgPty>
    </GrpHdr>
    <PmtInf>
      <PmtInfId>${escapeXml(pmtInfId)}</PmtInfId>
      <PmtMtd>TRF</PmtMtd>
      <NbOfTxs>${nbOfTxs}</NbOfTxs>
      <CtrlSum>${ctrlSum}</CtrlSum>
      <ReqdExctnDt>
        <Dt>${reqExctnDt}</Dt>
      </ReqdExctnDt>
      <Dbtr>
        <Nm>${escapeXml(params.payerName)}</Nm>
      </Dbtr>
      <DbtrAcct>
        <Id>
          <IBAN>${escapeXml(params.payerIban)}</IBAN>
        </Id>
      </DbtrAcct>
      <DbtrAgt>
        <FinInstnId>
          <BICFI>${escapeXml(params.payerBic)}</BICFI>
        </FinInstnId>
      </DbtrAgt>
${txBlocks}
    </PmtInf>
  </CstmrCdtTrfInitn>
</Document>
`;
}
