/**
 * REOS Enterprise v3.0 - Custom Menu
 */

var REOS = REOS || {};

REOS.buildMenu_ = function () {
  const ui = SpreadsheetApp.getUi();
  ui.createMenu('REOS')
    .addItem('Home', 'goHome')
    .addItem('Open Dashboard', 'showDashboard')
    .addItem('Open Agent Portal', 'showAgentPortal')
    .addItem('Open AI Assistant', 'showAIAssistant')
    .addItem('Open Mobile App Preview', 'showMobileApp')
    .addItem('Open Integration Hub', 'showIntegrations')
    .addItem('Open Sidebar', 'showSidebar')
    .addSeparator()
    .addItem('Open CRM App', 'showCRM')
    .addItem('Open Tasks App', 'showTasks')
    .addItem('Open Transactions App', 'showTransactions')
    .addItem('Open Investments App', 'showInvestments')
    .addItem('Open Rentals App', 'showRentals')
    .addItem('Open Finance App', 'showFinance')
    .addItem('Open Documents App', 'showDocuments')
    .addItem('Open Client Portal', 'showClientPortal')
    .addItem('Open Vendor Portal', 'showVendorPortal')
    .addItem('Open Automation App', 'showAutomation')
    .addSeparator()
    .addItem('AI Daily Briefing', 'aiDailyBriefing')
    .addSeparator()
    .addItem('Seed Automation Rules', 'automationSeedDefaults')
    .addItem('Install Automation Triggers', 'triggersInstallAll')
    .addSeparator()
    .addItem('CRM Sheet', 'goCRM')
    .addItem('Leads Sheet', 'goLeads')
    .addItem('Tasks Sheet', 'goTasks')
    .addSeparator()
    .addItem('Health Check', 'runHealthCheck')
    .addSeparator()
    .addItem('Install / Repair REOS', 'installREOS')
    .addToUi();
};

function showAutomation() {
  const html = HtmlService.createHtmlOutputFromFile('Automation')
    .setWidth(900)
    .setHeight(650);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Automation');
}

function showDocuments() {
  const html = HtmlService.createHtmlOutputFromFile('Documents')
    .setWidth(1000)
    .setHeight(700);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Documents');
}

function showClientPortal() {
  const html = HtmlService.createHtmlOutputFromFile('ClientPortal')
    .setWidth(1100)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Client Portal');
}

function showAgentPortal() {
  const html = HtmlService.createHtmlOutputFromFile('AgentPortal')
    .setWidth(1200)
    .setHeight(800);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Agent Portal');
}

function showVendorPortal() {
  const html = HtmlService.createHtmlOutputFromFile('VendorPortal')
    .setWidth(1100)
    .setHeight(760);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Vendor Portal');
}

function showAIAssistant() {
  const html = HtmlService.createHtmlOutputFromFile('AIAssistant')
    .setWidth(1000)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS AI Assistant');
}

function showMobileApp() {
  const template = HtmlService.createTemplateFromFile('AppShell');
  template.initialPage = 'home';
  const html = template.evaluate()
    .setWidth(430)
    .setHeight(820);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Mobile App');
}

function showIntegrations() {
  const html = HtmlService.createHtmlOutputFromFile('Integrations')
    .setWidth(1000)
    .setHeight(720);
  SpreadsheetApp.getUi().showModalDialog(html, 'REOS Integration Hub');
}
