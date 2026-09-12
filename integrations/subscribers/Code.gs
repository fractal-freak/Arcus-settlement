/** Bound to the subscriber sheet. Publishes only a count, never row contents. */
function doGet() {
  const sheet=SpreadsheetApp.getActiveSpreadsheet().getSheetById(0);
  if(!sheet)throw new Error('Subscriber tab gid=0 was not found');
  const rows=sheet.getDataRange().getDisplayValues();
  const headers=rows[0].map(value=>String(value).trim().toLowerCase());
  const emailColumn=headers.findIndex(value=>/^(email|email address|subscriber email)$/.test(value));
  if(emailColumn<0)throw new Error('Configure the subscriber identity column before deploying');
  const count=rows.slice(1).filter(row=>String(row[emailColumn]??'').trim()!=='').length;
  return ContentService.createTextOutput(JSON.stringify({count:count})).setMimeType(ContentService.MimeType.JSON);
}
