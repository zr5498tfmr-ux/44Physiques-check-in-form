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
//     - Click "Allow" (this lets the script use Drive & Gmail)
//  7. Click "Deploy" > "New deployment"
//     - Click the gear icon > select "Web app"
//     - Description: "44 Physiques Check-In"
//     - Execute as: "Me"
//     - Who has access: "Anyone"
//     - Click "Deploy"
//  8. Copy the Web app URL (looks like https://script.google.com/macros/s/XXXX/exec)
//  9. Paste that URL into index.html where it says SCRIPT_URL
//
// ============================================================

// ===== CONFIGURATION =====
var COACH_EMAILS = 'fentydavid@yahoo.com, cindybot1231@gmail.com';
var DRIVE_FOLDER_NAME = '44 Physiques Check-Ins';

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
        fileLinks.push({
          name: file.fieldName || file.name,
          url: 'Upload failed: ' + fileErr.toString()
        });
      }
    }

    // Build and send email
    var subject = '44 Physiques Check-In: ' + athleteName + ' (' + date + ')';
    var htmlBody = buildEmailHTML(fields, fileLinks, subFolder.getUrl());

    GmailApp.sendEmail(COACH_EMAILS, subject,
      'Weekly check-in received from ' + athleteName + '. Open this email in an HTML-compatible viewer to see full details.',
      {
        htmlBody: htmlBody,
        name: '44 Physiques Check-In'
      }
    );

    return ContentService.createTextOutput(JSON.stringify({ result: 'success' }))
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

// ===== EMAIL TEMPLATE =====
function buildEmailHTML(fields, fileLinks, folderUrl) {
  var html = '';
  html += '<div style="font-family: Arial, Helvetica, sans-serif; max-width: 640px; margin: 0 auto; background: #0a0a0a;">';

  // Header
  html += '<div style="background: #141414; padding: 24px; text-align: center; border-bottom: 3px solid #c41e2a;">';
  html += '<h1 style="color: #ffffff; margin: 0; font-size: 28px; letter-spacing: 3px;"><span style="color: #c41e2a;">44</span> PHYSIQUES</h1>';
  html += '<p style="color: #c41e2a; margin: 6px 0 0; font-size: 11px; letter-spacing: 4px; text-transform: uppercase;">Weekly Check-In Submission</p>';
  html += '</div>';

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
  Logger.log('Emails will be sent to: ' + COACH_EMAILS);
  Logger.log('');
  Logger.log('Next step: Deploy as Web App (see instructions at top of file)');
}
