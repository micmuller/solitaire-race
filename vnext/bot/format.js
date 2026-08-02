'use strict';

function formatBotReport(report) {
  const lines = [];
  lines.push(`Bot run: ${report.mode}`);
  lines.push(`Match: ${report.matchId}`);
  lines.push(`Seed: ${report.seed}`);
  lines.push(`Mode: ${report.gameMode}`);
  lines.push(`Speed: ${report.speed}`);
  lines.push(`Stop: ${report.stopReason}`);
  const botActions = report.bot ? report.bot.acks + report.bot.rejects + report.bot.snapshots : undefined;
  lines.push(`Actions: ${report.actionLogSteps ?? botActions ?? '-'}/${report.maxActions}`);
  lines.push(`Final rev: ${report.finalRev}`);
  lines.push(`Final hash: ${report.finalStateHash}`);
  if (report.actionLogHash) lines.push(`ActionLog hash: ${report.actionLogHash}`);
  lines.push('');
  lines.push('Bot results:');
  const bots = report.bots || { [report.bot?.clientId || 'bot']: report.bot };
  for (const [clientId, bot] of Object.entries(bots)) {
    lines.push(`  ${clientId}: ${bot.acks} ack, ${bot.rejects} reject, ${bot.snapshots} snapshot, next seq ${bot.nextSeq}`);
  }
  return lines.join('\n');
}

module.exports = { formatBotReport };
