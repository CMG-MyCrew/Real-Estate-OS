/**
 * REOS Enterprise v3.0 - SaaS Admin & Billing Framework
 *
 * Subscription, billing, tenant health, provisioning, and admin dashboard.
 */

var REOS = REOS || {};

REOS.SaaSAdmin = (function () {
  const BILLING_SHEET = 'TENANT_BILLING';
  const PROVISIONING_SHEET = 'TENANT_PROVISIONING';

  const BILLING_HEADERS = [
    'Billing ID', 'Tenant ID', 'Plan', 'Billing Status', 'MRR', 'Billing Email',
    'Payment Provider', 'Provider Customer ID', 'Provider Subscription ID',
    'Next Billing Date', 'Last Payment Date', 'Past Due Amount', 'Notes',
    'Created At', 'Updated At'
  ];

  const PROVISIONING_HEADERS = [
    'Provisioning ID', 'Tenant ID', 'Step', 'Status', 'Owner', 'Due Date',
    'Completed At', 'Notes', 'Created At', 'Updated At'
  ];

  const PLAN_MRR = { Starter: 99, Pro: 299, Enterprise: 999 };

  function ensureSheets() {
    ensureTable_(BILLING_SHEET, BILLING_HEADERS);
    ensureTable_(PROVISIONING_SHEET, PROVISIONING_HEADERS);
  }

  function ensureTable_(sheetName, headers) {
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    let sheet = ss.getSheetByName(sheetName);
    if (!sheet) sheet = ss.insertSheet(sheetName);
    if (sheet.getLastRow() === 0) {
      sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
      sheet.setFrozenRows(1);
      sheet.getRange(1, 1, 1, headers.length).setFontWeight('bold');
    }
    return sheet;
  }

  function provisionTenant(tenantId) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    const tenant = REOS.Tenants.getTenant(tenantId);
    if (!tenant) throw new Error('Tenant not found: ' + tenantId);

    const steps = ['Create tenant record', 'Configure branding', 'Grant owner access', 'Create billing profile', 'Seed default automation', 'Quality check'];
    const rows = steps.map(function (step, index) {
      const due = new Date();
      due.setDate(due.getDate() + index);
      return REOS.Database.insert(PROVISIONING_SHEET, {
        'Tenant ID': tenantId,
        Step: step,
        Status: index === 0 ? 'Completed' : 'Open',
        Owner: tenant['Owner Email'],
        'Due Date': due,
        'Completed At': index === 0 ? new Date() : '',
        Notes: ''
      }, { idField: 'Provisioning ID', idPrefix: 'PROV' });
    });

    createBillingProfile(tenantId, tenant.Plan, tenant['Owner Email'], tenant['Billing Customer ID']);
    return rows;
  }

  function createBillingProfile(tenantId, plan, billingEmail, providerCustomerId) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    plan = plan || 'Starter';
    const next = new Date();
    next.setMonth(next.getMonth() + 1);
    return REOS.Database.insert(BILLING_SHEET, {
      'Tenant ID': tenantId,
      Plan: plan,
      'Billing Status': 'Active',
      MRR: PLAN_MRR[plan] || PLAN_MRR.Starter,
      'Billing Email': REOS.normalizeEmail_(billingEmail),
      'Payment Provider': 'Stripe',
      'Provider Customer ID': providerCustomerId || '',
      'Provider Subscription ID': '',
      'Next Billing Date': next,
      'Past Due Amount': 0
    }, { idField: 'Billing ID', idPrefix: 'BILL' });
  }

  function updateBilling(billingId, changes) {
    REOS.Security.requirePermission('finance:write');
    ensureSheets();
    return REOS.Database.update(BILLING_SHEET, 'Billing ID', billingId, changes || {});
  }

  function tenantHealth() {
    REOS.Security.requirePermission('reports:read');
    ensureSheets();
    const tenants = REOS.Tenants.listTenants();
    const billing = REOS.Database.getAll(BILLING_SHEET);
    return tenants.map(function (tenant) {
      const bill = billing.filter(function (b) { return String(b['Tenant ID'] || '') === String(tenant['Tenant ID'] || ''); })[0] || {};
      const accessCount = REOS.TenantSecurity.userTenants(tenant['Owner Email']).filter(function (a) { return String(a['Tenant ID'] || '') === String(tenant['Tenant ID'] || ''); }).length;
      return {
        tenantId: tenant['Tenant ID'],
        tenantName: tenant['Tenant Name'],
        plan: tenant.Plan,
        status: tenant.Status,
        billingStatus: bill['Billing Status'] || 'Not Configured',
        mrr: Number(bill.MRR || 0),
        ownerEmail: tenant['Owner Email'],
        accessConfigured: accessCount > 0,
        healthScore: scoreTenant_(tenant, bill, accessCount)
      };
    });
  }

  function dashboard() {
    const health = tenantHealth();
    return {
      tenantCount: health.length,
      activeTenantCount: health.filter(function (t) { return String(t.status || '').toLowerCase() === 'active'; }).length,
      mrr: health.reduce(function (total, t) { return total + Number(t.mrr || 0); }, 0),
      pastDueCount: health.filter(function (t) { return String(t.billingStatus || '').toLowerCase() === 'past due'; }).length,
      tenants: health
    };
  }

  function scoreTenant_(tenant, bill, accessCount) {
    let score = 100;
    if (String(tenant.Status || '').toLowerCase() !== 'active') score -= 40;
    if (!bill || !bill['Billing Status']) score -= 20;
    if (String(bill['Billing Status'] || '').toLowerCase() === 'past due') score -= 30;
    if (!accessCount) score -= 20;
    return Math.max(0, score);
  }

  return {
    ensureSheets: ensureSheets,
    provisionTenant: provisionTenant,
    createBillingProfile: createBillingProfile,
    updateBilling: updateBilling,
    tenantHealth: tenantHealth,
    dashboard: dashboard
  };
})();

function saasProvisionTenant(tenantId) { return REOS.SaaSAdmin.provisionTenant(tenantId); }
function saasCreateBillingProfile(tenantId, plan, billingEmail, providerCustomerId) { return REOS.SaaSAdmin.createBillingProfile(tenantId, plan, billingEmail, providerCustomerId); }
function saasDashboard() { return REOS.SaaSAdmin.dashboard(); }
