// ============================================================
//  44 PHYSIQUES - WEEKLY CHECK-IN GOOGLE APPS SCRIPT
// ============================================================
//
//  SETUP INSTRUCTIONS:
//  1. Go to https://script.google.com and click "New Project"
//  2. Delete any code in the editor
//  3. Paste this ENTIRE file into the editor
//  4. Change COACH_EMAIL below to your email address
//  5. Click the floppy disk icon (or Ctrl+S) to save
//  6. Click "Run" > select "testSetup" > click Run
//     - It will ask for permissions - click "Review Permissions"
//     - Choose your Google account
//     - Click "Advanced" > "Go to 44 Physiques Check-In (unsafe)"
//     - Click "Allow" (this lets the script use Drive, Sheets & Gmail)
//  7. Click "Deploy" > "New deployment"
//     - Click the gear icon > select "Web app"
//     - Description: "44 Physiques Check-In"
//     - Execute as: "Me"
//     - Who has access: "Anyone"
//     - Click "Deploy"
//  8. Copy the Web app URL (looks like https://script.google.com/macros/s/XXXX/exec)
//  9. Paste that URL into index.html where it says SCRIPT_URL
//
//  UPDATING AN EXISTING DEPLOYMENT:
//  - After pasting new code, re-run "testSetup" (it will ask you to re-approve
//    the new Sheets permission the first time), then redeploy:
//    "Deploy" > "Manage deployments" > pencil/edit > "Version: New version" > "Deploy".
//    The Web app URL stays the same, so index.html needs no change.
//
//  WHAT EACH CHECK-IN NOW DOES:
//  - Saves photos/videos to Google Drive (as before)
//  - Appends one row per check-in to the "44 Physiques Check-In Data" spreadsheet
//    (kept in the Drive folder) so data can be tracked and charted over time
//  - Emails the coach (as before)
//  - Emails the ATHLETE a confirmation with a copy of their submission plus a
//    "vs. your last check-in" comparison of their key numbers
//
// ============================================================

// ===== CONFIGURATION =====
var COACH_EMAILS = 'fentydavid@yahoo.com, cindybot1231@gmail.com';
var DRIVE_FOLDER_NAME = '44 Physiques Check-Ins';
var SPREADSHEET_NAME = '44 Physiques Check-In Data';

// Ordered list of columns for the tracking spreadsheet. The first column is the
// submission timestamp; the rest mirror the form field names exactly so each
// check-in becomes one comparable row in the athlete's history.
var FIELD_COLUMNS = [
  'Timestamp',
  'First Name', 'Last Name', 'Email', 'Check-In Date', 'Division', 'Competition Name',
  'Morning Weight (lbs)', 'Water Intake (gal/day)', 'Diet Adherence (1-10)', 'Nutrition Notes',
  'Appetite Level', 'Digestion Quality',
  'Digestion - Bloating', 'Digestion - Gas', 'Digestion - Constipation',
  'Digestion - Diarrhea', 'Digestion - Acid Reflux', 'Digestion - Nausea', 'Digestion Notes',
  'Weight Training Sessions', 'Missed Workouts', 'Training Intensity (1-10)', 'Training Notes',
  'Cardio Sessions', 'Avg Daily Steps', 'Avg Sleep (hours)',
  'Energy Level (1-10)', 'Stress Level (1-10)', 'Mood (1-10)', 'Menstrual Cycle Status',
  'Overall Feeling', 'Questions for Coach'
];

// Numeric metrics shown in the "vs. your last check-in" comparison. Each entry maps
// a form field name to the label used in the comparison table. higherIsBetter is used
// only to color the delta (green/red); omit it for neutral metrics.
var COMPARISON_METRICS = [
  { key: 'Morning Weight (lbs)', label: 'Morning Weight (lbs)' },
  { key: 'Water Intake (gal/day)', label: 'Water Intake (gal/day)', higherIsBetter: true },
  { key: 'Diet Adherence (1-10)', label: 'Diet Adherence (1-10)', higherIsBetter: true },
  { key: 'Weight Training Sessions', label: 'Weight Training Sessions', higherIsBetter: true },
  { key: 'Cardio Sessions', label: 'Cardio Sessions', higherIsBetter: true },
  { key: 'Avg Daily Steps', label: 'Avg Daily Steps', higherIsBetter: true },
  { key: 'Avg Sleep (hours)', label: 'Avg Sleep (hours)', higherIsBetter: true },
  { key: 'Training Intensity (1-10)', label: 'Training Intensity (1-10)', higherIsBetter: true },
  { key: 'Energy Level (1-10)', label: 'Energy Level (1-10)', higherIsBetter: true },
  { key: 'Stress Level (1-10)', label: 'Stress Level (1-10)', higherIsBetter: false },
  { key: 'Mood (1-10)', label: 'Mood (1-10)', higherIsBetter: true }
];

// ===== CORS PREFLIGHT HANDLER =====
function doGet(e) {
  return ContentService.createTextOutput(JSON.stringify({ status: 'ok' }))
    .setMimeType(ContentService.MimeType.JSON);
}

// ===== MAIN HANDLER =====
function doPost(e) {
  try {
    var data = JSON.parse(e.postData.contents);
    var fields = data.fields || {};
    var files = data.files || [];

    // Get or create main folder
    var mainFolder = getOrCreateFolder(DRIVE_FOLDER_NAME);

    // Create subfolder for this submission
    var athleteName = ((fields['First Name'] || '') + ' ' + (fields['Last Name'] || '')).trim();
    var date = fields['Check-In Date'] || Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd');
    var subFolderName = athleteName + ' - ' + date;
    var subFolder = mainFolder.createFolder(subFolderName);

    // Save uploaded files to Google Drive
    var fileLinks = [];
    var filesSkipped = 0;
    for (var i = 0; i < files.length; i++) {
      var file = files[i];
      try {
        var decoded = Utilities.base64Decode(file.data);
        var blob = Utilities.newBlob(decoded, file.mimeType, file.name);
        var driveFile = subFolder.createFile(blob);
        driveFile.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW);
        fileLinks.push({
          name: file.fieldName || file.name,
          url: driveFile.getUrl()
        });
      } catch (fileErr) {
        filesSkipped++;
        fileLinks.push({
          name: file.fieldName || file.name,
          url: 'Upload failed: ' + fileErr.toString()
        });
      }
    }

    // Log this check-in to the tracking spreadsheet and look up the athlete's
    // previous check-in (by email) BEFORE appending the new row, so we can build
    // a "vs. your last check-in" comparison.
    var comparison = [];
    try {
      var sheet = getDataSheet();
      var athleteEmail = (fields['Email'] || '').toString().trim();
      var previous = athleteEmail ? getPreviousCheckInRow(sheet, athleteEmail) : null;
      appendCheckInRow(sheet, fields);
      if (previous) {
        comparison = buildComparison(previous, fields);
      }
    } catch (sheetErr) {
      // Never let a spreadsheet issue block the email/notification path.
      comparison = [];
    }

    // Build and send the coach email (includes the comparison when available).
    var comparisonHTML = buildComparisonHTML(comparison);
    var subject = '44 Physiques Check-In: ' + athleteName + ' (' + date + ')';
    var htmlBody = buildEmailHTML(fields, fileLinks, subFolder.getUrl(), comparisonHTML);

    GmailApp.sendEmail(COACH_EMAILS, subject,
      'Weekly check-in received from ' + athleteName + '. Open this email in an HTML-compatible viewer to see full details.',
      {
        htmlBody: htmlBody,
        name: '44 Physiques Check-In'
      }
    );

    // Send the athlete a confirmation copy with their submitted data + comparison.
    var athleteEmailAddr = (fields['Email'] || '').toString().trim();
    if (athleteEmailAddr && isValidEmail(athleteEmailAddr)) {
      try {
        var athleteIntro =
          '<div style="padding: 0 24px 8px; color: #cccccc; font-family: Arial, Helvetica, sans-serif; font-size: 14px;">' +
          'Hi ' + escapeHtml((fields['First Name'] || 'there').toString()) + ', we received your weekly check-in. ' +
          'Here is a copy of everything you submitted' +
          (comparison.length ? ', along with how this week compares to your last check-in' : '') +
          '. Your coach will review it and follow up.</div>';
        var athleteBody = buildEmailHTML(fields, fileLinks, subFolder.getUrl(), comparisonHTML, athleteIntro);
        GmailApp.sendEmail(athleteEmailAddr,
          'Your 44 Physiques Check-In Confirmation (' + date + ')',
          'Thanks for your check-in! Open this email in an HTML-compatible viewer to see your full submission and progress comparison.',
          {
            htmlBody: athleteBody,
            name: '44 Physiques Check-In'
          }
        );
      } catch (athleteErr) {
        // Athlete confirmation is best-effort; the coach email already went out.
      }
    }

    return ContentService.createTextOutput(JSON.stringify({
      result: 'success',
      athlete: athleteName,
      filesUploaded: fileLinks.length,
      filesSkipped: filesSkipped
    }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService.createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

// ===== HELPERS =====
function getOrCreateFolder(name) {
  var folders = DriveApp.getFoldersByName(name);
  if (folders.hasNext()) {
    return folders.next();
  }
  return DriveApp.createFolder(name);
}

// ===== SPREADSHEET (DATA TRACKING) =====
// Returns the data sheet, creating the spreadsheet (and header row) on first use.
// The spreadsheet ID is cached in Script Properties so we always reuse the same file.
function getDataSheet() {
  var props = PropertiesService.getScriptProperties();
  var ssId = props.getProperty('DATA_SPREADSHEET_ID');
  var ss = null;

  if (ssId) {
    try {
      ss = SpreadsheetApp.openById(ssId);
    } catch (e) {
      ss = null; // stored ID no longer valid; recreate below
    }
  }

  if (!ss) {
    ss = SpreadsheetApp.create(SPREADSHEET_NAME);
    props.setProperty('DATA_SPREADSHEET_ID', ss.getId());
    // Move the new spreadsheet into the check-ins Drive folder for tidiness.
    try {
      var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
      DriveApp.getFileById(ss.getId()).moveTo(folder);
    } catch (moveErr) {
      // Non-fatal: spreadsheet still works from its default location.
    }
  }

  var sheet = ss.getSheets()[0];
  // Ensure a header row exists and matches FIELD_COLUMNS.
  if (sheet.getLastRow() === 0) {
    sheet.appendRow(FIELD_COLUMNS);
    sheet.setFrozenRows(1);
  }
  return sheet;
}

// Finds the most recent earlier row for this email and returns it as a
// { columnName: value } object, or null if the athlete has no prior check-in.
function getPreviousCheckInRow(sheet, email) {
  var lastRow = sheet.getLastRow();
  if (lastRow < 2) return null; // header only

  var values = sheet.getDataRange().getValues();
  var header = values[0];
  var emailCol = header.indexOf('Email');
  if (emailCol === -1) return null;

  var target = email.toString().trim().toLowerCase();
  for (var r = values.length - 1; r >= 1; r--) {
    var rowEmail = (values[r][emailCol] || '').toString().trim().toLowerCase();
    if (rowEmail === target) {
      var obj = {};
      for (var c = 0; c < header.length; c++) {
        obj[header[c]] = values[r][c];
      }
      return obj;
    }
  }
  return null;
}

// Appends the current submission as a new row, ordered to match FIELD_COLUMNS.
function appendCheckInRow(sheet, fields) {
  var row = [];
  for (var i = 0; i < FIELD_COLUMNS.length; i++) {
    var col = FIELD_COLUMNS[i];
    if (col === 'Timestamp') {
      row.push(Utilities.formatDate(new Date(), 'America/New_York', 'yyyy-MM-dd HH:mm'));
    } else {
      var val = fields[col];
      row.push(val === undefined || val === null ? '' : val);
    }
  }
  sheet.appendRow(row);
}

// Builds the comparison data (current vs. previous) for the numeric metrics.
function buildComparison(previousRow, fields) {
  var result = [];
  for (var i = 0; i < COMPARISON_METRICS.length; i++) {
    var metric = COMPARISON_METRICS[i];
    var curRaw = fields[metric.key];
    var prevRaw = previousRow[metric.key];
    var cur = parseFloat(curRaw);
    var prev = parseFloat(prevRaw);
    if (isNaN(cur) || isNaN(prev)) continue;
    result.push({
      label: metric.label,
      current: cur,
      previous: prev,
      delta: cur - prev,
      higherIsBetter: metric.higherIsBetter
    });
  }
  return result;
}

// Renders the comparison as a branded HTML table. Returns '' when there's nothing
// to compare (e.g. the athlete's first check-in).
function buildComparisonHTML(comparison) {
  if (!comparison || comparison.length === 0) return '';

  var html = '';
  html += '<div style="padding: 16px 24px 0;">';
  html += '<h2 style="color: #c41e2a; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 8px; margin: 8px 0 12px;">Progress vs. Last Check-In</h2>';
  html += '<table style="width: 100%; border-collapse: collapse;">';
  html += '<tr>';
  html += '<th style="text-align: left; padding: 8px 12px; color: #999; font-size: 12px; border-bottom: 1px solid #333;">Metric</th>';
  html += '<th style="text-align: right; padding: 8px 12px; color: #999; font-size: 12px; border-bottom: 1px solid #333;">Last</th>';
  html += '<th style="text-align: right; padding: 8px 12px; color: #999; font-size: 12px; border-bottom: 1px solid #333;">This Week</th>';
  html += '<th style="text-align: right; padding: 8px 12px; color: #999; font-size: 12px; border-bottom: 1px solid #333;">Change</th>';
  html += '</tr>';

  for (var i = 0; i < comparison.length; i++) {
    var m = comparison[i];
    var deltaColor = '#999999';
    if (m.delta !== 0 && m.higherIsBetter !== undefined) {
      var good = m.higherIsBetter ? (m.delta > 0) : (m.delta < 0);
      deltaColor = good ? '#28a745' : '#e02535';
    }
    var deltaStr = (m.delta > 0 ? '+' : '') + formatNumber(m.delta);
    var arrow = m.delta > 0 ? ' ▲' : (m.delta < 0 ? ' ▼' : '');
    html += '<tr>';
    html += '<td style="padding: 8px 12px; color: #ffffff; font-size: 13px; border-bottom: 1px solid #1a1a1a;">' + escapeHtml(m.label) + '</td>';
    html += '<td style="padding: 8px 12px; color: #999; font-size: 13px; text-align: right; border-bottom: 1px solid #1a1a1a;">' + formatNumber(m.previous) + '</td>';
    html += '<td style="padding: 8px 12px; color: #ffffff; font-size: 13px; text-align: right; border-bottom: 1px solid #1a1a1a;">' + formatNumber(m.current) + '</td>';
    html += '<td style="padding: 8px 12px; color: ' + deltaColor + '; font-size: 13px; font-weight: bold; text-align: right; border-bottom: 1px solid #1a1a1a;">' + deltaStr + arrow + '</td>';
    html += '</tr>';
  }

  html += '</table>';
  html += '</div>';
  return html;
}

// Formats a number without trailing ".0" noise (e.g. 9100 not 9100.0, 7.2 stays 7.2).
function formatNumber(n) {
  if (Math.round(n) === n) return n.toString();
  return (Math.round(n * 10) / 10).toString();
}

// Basic email sanity check before sending the athlete confirmation.
function isValidEmail(email) {
  return /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email);
}

// ===== EMAIL TEMPLATE =====
// introHTML (optional) is rendered just under the header (used for the athlete's
// confirmation note). comparisonHTML (optional) is the "vs. last check-in" table.
function buildEmailHTML(fields, fileLinks, folderUrl, comparisonHTML, introHTML) {
  var html = '';
  html += '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background: #0a0a0a;">';

  // Header
  html += '<div style="background: #141414; padding: 24px; text-align: center; border-bottom: 3px solid #c41e2a;">';
  html += '<h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 3px;"><span style="color: #c41e2a;">44</span> PHYSIQUES</h1>';
  html += '<p style="color: #c41e2a; margin: 6px 0 0; font-size: 11px; letter-spacing: 4px; text-transform: uppercase;">Weekly Check-In Submission</p>';
  html += '</div>';

  // Optional intro note (athlete confirmation)
  if (introHTML) {
    html += '<div style="padding: 20px 0 0;">' + introHTML + '</div>';
  }

  // Optional comparison vs. previous check-in
  if (comparisonHTML) {
    html += comparisonHTML;
  }

  // Body
  html += '<div style="padding: 24px;">';

  // Sections
  var sections = [
    {
      title: 'Athlete Information',
      keys: ['First Name', 'Last Name', 'Email', 'Check-In Date', 'Division', 'Competition Name']
    },
    {
      title: 'Body Stats & Nutrition',
      keys: ['Morning Weight (lbs)', 'Water Intake (gal/day)', 'Diet Adherence (1-10)', 'Nutrition Notes']
    },
    {
      title: 'Training & Cardio',
      keys: ['Weight Training Sessions', 'Missed Workouts', 'Training Intensity (1-10)', 'Training Notes', 'Cardio Sessions', 'Avg Daily Steps']
    },
    {
      title: 'Recovery & Wellness',
      keys: ['Avg Sleep (hours)', 'Energy Level (1-10)', 'Stress Level (1-10)', 'Mood (1-10)', 'Menstrual Cycle Status']
    },
    {
      title: 'Notes for Coach',
      keys: ['Overall Feeling', 'Questions for Coach']
    }
  ];

  for (var s = 0; s < sections.length; s++) {
    var section = sections[s];
    var hasData = false;

    // Check if section has any data
    for (var k = 0; k < section.keys.length; k++) {
      var val = fields[section.keys[k]];
      if (val && val.toString().trim() !== '') {
        hasData = true;
        break;
      }
    }
    if (!hasData) continue;

    html += '<h2 style="color: #c41e2a; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 8px; margin: 24px 0 12px;">' + section.title + '</h2>';
    html += '<table style="width: 100%; border-collapse: collapse;">';

    for (var j = 0; j < section.keys.length; j++) {
      var key = section.keys[j];
      var value = fields[key];
      if (value && value.toString().trim() !== '') {
        html += '<tr>';
        html += '<td style="padding: 8px 12px; color: #999; font-size: 13px; width: 45%; vertical-align: top; border-bottom: 1px solid #1a1a1a;">' + key + '</td>';
        html += '<td style="padding: 8px 12px; color: #ffffff; font-size: 14px; border-bottom: 1px solid #1a1a1a;">' + escapeHtml(value.toString()) + '</td>';
        html += '</tr>';
      }
    }

    html += '</table>';
  }

  // File links
  if (fileLinks.length > 0) {
    html += '<h2 style="color: #c41e2a; font-size: 14px; letter-spacing: 2px; text-transform: uppercase; border-bottom: 1px solid #333; padding-bottom: 8px; margin: 24px 0 12px;">Photos & Files</h2>';
    for (var f = 0; f < fileLinks.length; f++) {
      html += '<p style="margin: 6px 0;"><a href="' + fileLinks[f].url + '" style="color: #c41e2a; text-decoration: none;">&#128247; ' + escapeHtml(fileLinks[f].name) + '</a></p>';
    }
    html += '<p style="margin: 16px 0 0;"><a href="' + folderUrl + '" style="background: #c41e2a; color: #ffffff; padding: 10px 20px; text-decoration: none; border-radius: 6px; font-size: 13px; letter-spacing: 1px;">VIEW ALL FILES IN DRIVE</a></p>';
  }

  html += '</div>';

  // Footer
  html += '<div style="background: #141414; padding: 16px; text-align: center; border-top: 1px solid #333;">';
  html += '<p style="color: #666; font-size: 11px; margin: 0;"><span style="color: #c41e2a; font-weight: bold;">44 PHYSIQUES</span> &bull; Chase the Physique</p>';
  html += '</div>';

  html += '</div>';
  return html;
}

function escapeHtml(text) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// ===== TEST FUNCTION =====
// Run this first to verify permissions and create the Drive folder
function testSetup() {
  var folder = getOrCreateFolder(DRIVE_FOLDER_NAME);
  Logger.log('SUCCESS! Drive folder ready: ' + folder.getUrl());

  var sheet = getDataSheet();
  Logger.log('Tracking spreadsheet ready: ' + sheet.getParent().getUrl());

  Logger.log('Coach emails: ' + COACH_EMAILS);
  Logger.log('Athletes also receive a confirmation copy at the email they submit.');
  Logger.log('');
  Logger.log('Next step: Deploy as Web App (see instructions at top of file)');
}
