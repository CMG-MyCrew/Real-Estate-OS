/**
 * REOS Enterprise v3.0 - PWA / Mobile Web App Framework
 *
 * Publishes REOS as a mobile-friendly Apps Script web app shell.
 */

var REOS = REOS || {};

function doGet(e) {
  e = e || { parameter: {} };
  const page = String((e.parameter && e.parameter.page) || 'app').toLowerCase();

  if (page === 'manifest') {
    return ContentService
      .createTextOutput(JSON.stringify(REOS.WebApp.getManifest()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  if (page === 'health') {
    return ContentService
      .createTextOutput(JSON.stringify(REOS.WebApp.health()))
      .setMimeType(ContentService.MimeType.JSON);
  }

  const template = HtmlService.createTemplateFromFile('AppShell');
  template.initialPage = page;
  return template.evaluate()
    .setTitle('REOS Enterprise')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, maximum-scale=1, viewport-fit=cover')
    .addMetaTag('mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-capable', 'yes')
    .addMetaTag('apple-mobile-web-app-title', 'REOS')
    .addMetaTag('theme-color', '#0f2742');
}

REOS.WebApp = (function () {
  function getManifest() {
    return {
      name: 'REOS Enterprise',
      short_name: 'REOS',
      description: 'Real Estate Operating System',
      start_url: '?page=app',
      display: 'standalone',
      background_color: '#f6f8fb',
      theme_color: '#0f2742',
      orientation: 'portrait-primary',
      icons: []
    };
  }

  function getMobileHome() {
    REOS.Security.requirePermission('reports:read');
    return {
      generatedAt: new Date(),
      user: REOS.Security.getCurrentUserEmail(),
      dashboard: REOS.Dashboard.getExecutiveDashboard(),
      tasks: {
        overdue: REOS.Tasks.overdue().slice(0, 10),
        dueToday: REOS.Tasks.dueToday().slice(0, 10),
        upcoming: REOS.Tasks.upcoming(7).slice(0, 10)
      },
      quickLinks: [
        { label: 'Agent Portal', page: 'agent' },
        { label: 'Tasks', page: 'tasks' },
        { label: 'CRM', page: 'crm' },
        { label: 'Transactions', page: 'transactions' },
        { label: 'Documents', page: 'documents' },
        { label: 'AI Assistant', page: 'ai' }
      ]
    };
  }

  function getPageData(page) {
    page = String(page || 'home').toLowerCase();
    if (page === 'agent') return REOS.AgentPortal.getWorkspace();
    if (page === 'dashboard') return REOS.Dashboard.getExecutiveDashboard();
    if (page === 'tasks') return { overdue: REOS.Tasks.overdue(), dueToday: REOS.Tasks.dueToday(), upcoming: REOS.Tasks.upcoming(7) };
    if (page === 'crm') return { contacts: REOS.CRM.listContacts().slice(0, 50), leads: REOS.CRM.listLeads().slice(0, 50) };
    if (page === 'transactions') return REOS.Transactions.dashboard();
    if (page === 'rentals') return REOS.Rentals.dashboard();
    if (page === 'finance') return REOS.Finance.dashboard();
    if (page === 'documents') return { documents: REOS.Documents.search('').slice(0, 50) };
    if (page === 'ai') return { status: 'AI Assistant ready' };
    return getMobileHome();
  }

  function health() {
    return {
      ok: true,
      app: 'REOS Enterprise',
      version: '3.0',
      timestamp: new Date().toISOString()
    };
  }

  return {
    getManifest: getManifest,
    getMobileHome: getMobileHome,
    getPageData: getPageData,
    health: health
  };
})();

function webAppGetMobileHome() { return REOS.WebApp.getMobileHome(); }
function webAppGetPageData(page) { return REOS.WebApp.getPageData(page); }
