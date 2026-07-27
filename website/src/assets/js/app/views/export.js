/**
 * Taking the record away.
 *
 * The export format IS the internal format (docs/DECISIONS.md D14), so what
 * downloads here is not a summary or a courtesy PDF — it is the record, in the
 * shape we hold it, verifiable by someone who has never heard of us.
 *
 * Exporting is itself an event. The student is told that before they click,
 * because a surprise entry in your own record is exactly the kind of thing this
 * system exists to prevent.
 */

const stamp = () => new Date().toISOString().slice(0, 10);

/** Trigger a download of an in-memory string. Revokes the URL on the next tick. */
function saveFile(name, contents, type = "application/json") {
  const blob = new Blob([contents], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = name;
  document.body.append(link);
  link.click();
  link.remove();
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

/**
 * Run the export and save it.
 * @returns {Promise<object>} the export summary the API returned
 */
export async function exportAndDownload(ctx, { includeDocuments = false } = {}) {
  const result = await ctx.api.exportRecord(ctx.subjectId, { includeDocuments });

  // `archive` holds the real file contents; `files` holds their sizes. Saving the
  // archive whole keeps the manifest, the events and the signature together —
  // splitting them would produce files that cannot be verified on their own.
  saveFile(
    `richenquest-record-${ctx.subjectId}-${stamp()}.json`,
    JSON.stringify(result.archive ?? result, null, 2)
  );

  ctx.invalidate();
  return result;
}

/** Plain-language description of what an export contains. */
export function exportSummaryText(result) {
  if (!result) return "";
  const parts = [
    `${result.event_count} entr${result.event_count === 1 ? "y" : "ies"}`,
    result.includes_identity ? "your identity details" : "no identity details",
    result.chain_verified ? "verified at the moment of export" : "NOT verified at export — please contact us",
  ];
  return `Downloaded: ${parts.join(", ")}.`;
}
