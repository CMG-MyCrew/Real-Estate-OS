/**
 * REOS Enterprise v3.2.11 - Dynamic Menu Registry
 *
 * Modules register menu items declaratively. Menu.gs renders a single menu
 * from the registry, eliminating ZZ_* menu override files.
 */

var REOS = REOS || {};

REOS.MenuRegistry = (function () {
  var groups = [];
  var initialized = false;

  function reset() {
    groups = [];
    initialized = false;
  }

  function registerGroup(group) {
    if (!group || !group.key) throw new Error('Menu group requires a key.');
    var existingIndex = groups.findIndex(function (g) { return g.key === group.key; });
    var normalized = {
      key: group.key,
      label: group.label || group.key,
      order: Number(group.order || 1000),
      enabled: group.enabled !== false,
      items: (group.items || []).filter(function (item) { return item && item.label && item.functionName; })
    };
    if (existingIndex >= 0) groups[existingIndex] = normalized;
    else groups.push(normalized);
    return normalized;
  }

  function registerItem(groupKey, item) {
    var group = groups.filter(function (g) { return g.key === groupKey; })[0];
    if (!group) group = registerGroup({ key: groupKey, label: groupKey, order: 1000, items: [] });
    if (item && item.label && item.functionName) group.items.push(item);
    return item;
  }

  function initializeDefaults() {
    if (initialized) return groups;
    initialized = true;

    registerGroup({
      key: 'operations',
      label: 'Operations',
      order: 10,
      items: [
        { label: 'Run Diagnostics', functionName: 'reosRunDiagnostics' },
        { label: 'Diagnostics Summary', functionName: 'reosDiagnosticsSummary' },
        { label: 'Run Self-Healing', functionName: 'reosRunSelfHealing' },
        { label: 'Run Environment Validation', functionName: 'reosRunEnvironmentValidation' },
        { label: 'Environment Summary', functionName: 'reosEnvironmentSummary' },
        { label: 'Run Integration Monitor', functionName: 'reosRunIntegrationMonitor' },
        { label: 'Integration Summary', functionName: 'reosIntegrationSummary' },
        { label: 'Run Performance Monitor', functionName: 'reosRunPerformanceMonitor' },
        { label: 'Performance Summary', functionName: 'reosPerformanceSummary' },
        { label: 'Run Error Scan', functionName: 'reosRunErrorScan' },
        { label: 'Error Summary', functionName: 'reosErrorSummary' },
        { label: 'Open Error Dashboard', functionName: 'showErrorDashboard' }
      ]
    });

    registerGroup({
      key: 'foundation',
      label: 'Foundation',
      order: 20,
      items: [
        { label: 'Run Phase 1 Upgrade', functionName: 'reosRunPhase1Upgrade' },
        { label: 'Validate Phase 1 Upgrade', functionName: 'reosValidatePhase1Upgrade' },
        { label: 'Core Diagnostics', functionName: 'reosCoreDiagnostics' },
        { label: 'Sync Module Sheets', functionName: 'reosCoreSyncModules' },
        { label: 'Module Health Report', functionName: 'reosModulesHealthReport' },
        { label: 'Initialize Enabled Modules', functionName: 'reosModulesSyncEnabled' }
      ]
    });

    registerGroup({
      key: 'finance',
      label: 'Finance',
      order: 30,
      items: [
        { label: 'Open Finance Manager', functionName: 'showFinanceManager' },
        { label: 'Open Finance Enhancements', functionName: 'showFinanceEnhancements' },
        { label: 'Open Finance Dashboards', functionName: 'showFinanceDashboards' },
        { label: 'Open QuickBooks Connector', functionName: 'showQuickBooksConnector' },
        { label: 'Open QuickBooks OAuth', functionName: 'showQuickBooksOAuth' }
      ]
    });

    registerGroup({
      key: 'portal',
      label: 'Portals',
      order: 40,
      items: [
        { label: 'Open Portal Foundation', functionName: 'showPortalFoundation' },
        { label: 'Open Portal Auth', functionName: 'showPortalAuth' },
        { label: 'Open Investor Portal', functionName: 'showInvestorPortal' },
        { label: 'Open Vendor Portal UI', functionName: 'showVendorPortalUI' },
        { label: 'Open Client/Lender Portal', functionName: 'showClientLenderPortal' }
      ]
    });

    registerGroup({
      key: 'apps',
      label: 'Applications',
      order: 50,
      items: [
        { label: 'Open Dashboard Hub', functionName: 'showDashboardHub' },
        { label: 'Open CRM', functionName: 'showCRM' },
        { label: 'Open Documents', functionName: 'showDocuments' },
        { label: 'Open Automation', functionName: 'showAutomation' },
        { label: 'Open AI Workspace', functionName: 'showAI' },
        { label: 'Open Admin', functionName: 'showAdmin' }
      ]
    });

    registerGroup({
      key: 'system',
      label: 'System',
      order: 90,
      items: [
        { label: 'Menu Registry Summary', functionName: 'reosMenuRegistrySummary' },
        { label: 'Rebuild REOS Menu', functionName: 'reosRebuildMenu' },
        { label: 'Health Check', functionName: 'runHealthCheck' },
        { label: 'Install / Repair REOS', functionName: 'installREOS' }
      ]
    });

    return groups;
  }

  function getGroups() {
    initializeDefaults();
    return groups.filter(function (g) { return g.enabled && g.items.length; }).sort(function (a, b) { return a.order - b.order; });
  }

  function render() {
    var ui = SpreadsheetApp.getUi();
    var menu = ui.createMenu('REOS');
    var activeGroups = getGroups();
    activeGroups.forEach(function (group, groupIndex) {
      if (groupIndex > 0) menu.addSeparator();
      group.items.forEach(function (item) {
        if (functionExists_(item.functionName)) menu.addItem(item.label, item.functionName);
      });
    });
    menu.addToUi();
    return activeGroups;
  }

  function functionExists_(functionName) {
    try { return typeof globalThis[functionName] === 'function'; } catch (error) { return true; }
  }

  return {
    reset: reset,
    registerGroup: registerGroup,
    registerItem: registerItem,
    initializeDefaults: initializeDefaults,
    getGroups: getGroups,
    render: render
  };
})();

function reosMenuRegistrySummary() {
  var groups = REOS.MenuRegistry.getGroups();
  SpreadsheetApp.getUi().alert('REOS Menu Registry', JSON.stringify(groups, null, 2).slice(0, 1800), SpreadsheetApp.getUi().ButtonSet.OK);
  return groups;
}

function reosRebuildMenu() {
  REOS.MenuRegistry.reset();
  REOS.MenuRegistry.initializeDefaults();
  REOS.buildMenu_();
  SpreadsheetApp.getUi().alert('REOS menu rebuilt from registry.');
  return REOS.MenuRegistry.getGroups();
}
