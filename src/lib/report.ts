/**
 * Flight report: turn a prepared transaction, its simulation, the risk
 * findings, and the plain-language explanation into one shareable
 * markdown document. Users copy it for their records, support tickets,
 * or team review.
 *
 * Pure and deterministic: same input in, same string out. No I/O, no
 * globals, no clock — the caller supplies `generatedAt`.
 */

import type {
  Explanation,
  Hex,
  PostFlightCheck,
  PreparedTx,
  RiskFinding,
  RiskSeverity,
  SimulationResult,
} from './types';
import { t } from './i18n';
import type { Lang } from './i18n';

const SEVERITY_PREFIX: Record<RiskSeverity, (lang: Lang) => string> = {
  danger: (lang) => t(lang, 'rep.severityDanger'),
  caution: (lang) => t(lang, 'rep.severityCaution'),
  info: (lang) => t(lang, 'rep.severityInfo'),
};

/** One clean line of text: fold any newlines into spaces, trim the ends. */
function oneLine(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/** Table cells additionally need their pipes escaped so rows stay intact. */
function tableCell(text: string): string {
  return oneLine(text).replace(/\|/g, '\\|');
}

/**
 * Render the full flight report as markdown.
 *
 * Sections appear in a fixed order; optional sections (warnings,
 * post-flight verification, transaction hash, explorer link) are
 * omitted entirely when there is nothing to show. The output never
 * ends with a newline and no line carries trailing whitespace.
 */
export function flightReportMarkdown(input: {
  networkLabel: string;
  tx: PreparedTx;
  sim: SimulationResult;
  risks: RiskFinding[];
  explanation: Explanation;
  postflight?: PostFlightCheck | null;
  hash?: Hex | null;
  explorerHref?: string | null;
  generatedAt: string;
  lang?: Lang;
}): string {
  const lang = input.lang ?? 'en';
  const blocks: string[] = [];

  // Title: what this transaction does, then where and when we checked it.
  blocks.push(`# ${oneLine(input.tx.summary)}`);
  blocks.push(`${oneLine(input.networkLabel)} — ${oneLine(input.generatedAt)}`);

  // What the simulation showed.
  blocks.push(`## ${t(lang, 'rep.simSection')}`);
  blocks.push(oneLine(input.explanation.outcome));
  if (input.explanation.bullets.length > 0) {
    blocks.push(input.explanation.bullets.map((b) => `- ${oneLine(b)}`).join('\n'));
  }

  // Warnings — only when the risk check actually found something.
  if (input.risks.length > 0) {
    blocks.push(`## ${t(lang, 'rep.warningsSection')}`);
    blocks.push(
      input.risks
        .map(
          (r) =>
            `- ${SEVERITY_PREFIX[r.severity](lang)} ${oneLine(r.title)} — ${oneLine(r.detail)}`,
        )
        .join('\n'),
    );
  }

  // Post-flight verification — only after the transaction has landed.
  if (input.postflight) {
    blocks.push(`## ${t(lang, 'rep.postflightSection')}`);
    blocks.push(
      [
        t(lang, 'rep.tableHeader'),
        '| --- | --- | --- | --- |',
        ...input.postflight.lines.map((l) => {
          const mark =
            l.status === 'matched'
              ? '✓'
              : l.status === 'mismatched'
                ? '✗'
                : t(lang, 'rep.notChecked');
          const label = l.note ? `${l.label} (${l.note})` : l.label;
          return `| ${tableCell(label)} | ${tableCell(l.simulated)} | ${tableCell(l.actual)} | ${mark} |`;
        }),
      ].join('\n'),
    );
    blocks.push(
      input.postflight.matched
        ? input.postflight.hasUnverified
          ? t(lang, 'rep.verdictMatchedPartial')
          : t(lang, 'rep.verdictMatched')
        : t(lang, 'rep.verdictMismatched'),
    );
  }

  // On-chain references, when we have them.
  if (input.hash) {
    blocks.push(t(lang, 'rep.txHash', { hash: input.hash }));
  }
  if (input.explorerHref) {
    blocks.push(t(lang, 'rep.explorerLink', { href: oneLine(input.explorerHref) }));
  }

  blocks.push(t(lang, 'rep.footer'));

  // Drop empty blocks so the report never contains stray blank sections,
  // then join with exactly one blank line between blocks. No trailing
  // newline, no trailing whitespace on any line.
  return blocks.filter((b) => b.length > 0).join('\n\n');
}
