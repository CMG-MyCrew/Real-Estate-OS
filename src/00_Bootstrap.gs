/**
 * REOS Enterprise v3.2.7 - Bootstrap Defaults
 *
 * Loads before feature modules and provides safe defaults only.
 * Config.gs remains the authoritative configuration source.
 */

var REOS = REOS || {};

REOS.CONFIG = REOS.CONFIG || {};

REOS.CONFIG.APP = Object.assign({
  NAME: 'REOS Enterprise',
  VERSION: '3.2.7',
  TIME_ZONE: 'America/New_York'
}, REOS.CONFIG.APP || {});

REOS.CONFIG.SHEETS = Object.assign({
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  USERS: 'USERS',
  LOOKUPS: 'LOOKUPS',
  CRM: 'CRM',
  LEADS: 'LEADS',
  TASKS: 'TASKS',
  ACTIVITIES: 'ACTIVITIES',
  SYSTEM_LOG: 'SYSTEM_LOG',
  SYSTEM_AUDIT: 'SYSTEM_AUDIT',
  SECURITY_POLICIES: 'SECURITY_POLICIES',
  SECURITY_EVENTS: 'SECURITY_EVENTS',
  CUSTOMERS: 'CUSTOMERS',
  PROPERTIES: 'PROPERTIES',
  UNITS: 'UNITS',
  WORK_ORDERS: 'WORK_ORDERS',
  VENDORS: 'VENDORS',
  VENDOR_ASSIGNMENTS: 'VENDOR_ASSIGNMENTS',
  DOCUMENTS: 'DOCUMENTS',
  FIN_INVOICES: 'FIN_INVOICES',
  FIN_VENDOR_PAYMENTS: 'FIN_VENDOR_PAYMENTS',
  FIN_EXPENSES: 'FIN_EXPENSES',
  PORTAL_ACCOUNTS: 'PORTAL_ACCOUNTS',
  PORTAL_SESSIONS: 'PORTAL_SESSIONS',
  PORTAL_INVITATIONS: 'PORTAL_INVITATIONS',
  PORTAL_MESSAGES: 'PORTAL_MESSAGES',
  PORTAL_TASKS: 'PORTAL_TASKS'
}, REOS.CONFIG.SHEETS || {});

REOS.CONFIG.ROLES = Object.assign({
  ADMIN: 'Admin',
  OWNER: 'Owner',
  MANAGER: 'Manager',
  ACCOUNTANT: 'Accountant',
  AGENT: 'Agent',
  VENDOR: 'Vendor',
  CLIENT: 'Client',
  INVESTOR: 'Investor',
  LENDER: 'Lender'
}, REOS.CONFIG.ROLES || {});

REOS.CONFIG.ID_PREFIXES = Object.assign({
  CUSTOMER: 'CUS',
  LEAD: 'LEAD',
  TASK: 'TASK',
  ACTIVITY: 'ACT',
  PROPERTY: 'PROP',
  WORK_ORDER: 'WO',
  VENDOR: 'VEN',
  INVOICE: 'INV',
  PAYMENT: 'PAY',
  EXPENSE: 'EXP',
  PORTAL_ACCOUNT: 'PACC'
}, REOS.CONFIG.ID_PREFIXES || {});

REOS.getSheetName_ = function (key, fallback) {
  return (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS[key]) || fallback || key;
};

REOS.getIdPrefix_ = function (key, fallback) {
  return (REOS.CONFIG && REOS.CONFIG.ID_PREFIXES && REOS.CONFIG.ID_PREFIXES[key]) || fallback || key;
};
