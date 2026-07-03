/**
 * REOS Enterprise v3.0 - Navigation Helpers
 */

var REOS = REOS || {};

function goHome() { REOS.activateSheet_(REOS.CONFIG.SHEETS.HOME); }
function goCRM() { REOS.activateSheet_(REOS.CONFIG.SHEETS.CRM); }
function goLeads() { REOS.activateSheet_(REOS.CONFIG.SHEETS.LEADS); }
function goTasks() { REOS.activateSheet_(REOS.CONFIG.SHEETS.TASKS); }
function goSettings() { REOS.activateSheet_(REOS.CONFIG.SHEETS.SETTINGS); }

REOS.activateSheet_ = function (sheetName) {
  const sheet = REOS.getSheet_(sheetName);
  SpreadsheetApp.getActiveSpreadsheet().setActiveSheet(sheet);
};

function showSidebar() {
  const html = HtmlService.createHtmlOutputFromFile('Sidebar')
    .setTitle('REOS');
  SpreadsheetApp.getUi().showSidebar(html);
}
