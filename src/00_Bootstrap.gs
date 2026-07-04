/**
 * REOS Enterprise v3.0 - Bootstrap
 *
 * This file is intentionally prefixed with 00_ so Apps Script/clasp loads it
 * before feature modules. It provides safe defaults used by modules that read
 * REOS.CONFIG during file initialization.
 */

var REOS = REOS || {};

REOS.CONFIG = REOS.CONFIG || {};

REOS.CONFIG.APP = Object.assign({
  NAME: 'REOS Enterprise',
  VERSION: '3.0.0',
  TIME_ZONE: 'America/New_York'
}, REOS.CONFIG.APP || {});

REOS.CONFIG.SHEETS = Object.assign({
  HOME: 'HOME',
  SETTINGS: 'SETTINGS',
  USERS: 'USERS',
  LOOKUPS: 'LOOKUPS',
  CRM: 'CRM',
  CONTACTS: 'CRM',
  CLIENTS: 'CRM',
  LEADS: 'LEADS',
  ACTIVITIES: 'ACTIVITIES',
  TASKS: 'TASKS',
  TRANSACTIONS: 'TRANSACTIONS',
  COMMISSIONS: 'COMMISSIONS',
  PROPERTIES: 'PROPERTIES',
  INVESTMENTS: 'INVESTMENTS',
  RENTALS: 'RENTALS',
  LEASES: 'LEASES',
  MAINTENANCE: 'MAINTENANCE',
  FINANCE: 'FINANCE',
  DOCUMENTS: 'DOCUMENTS',
  SIGNATURE_REQUESTS: 'SIGNATURE_REQUESTS',
  INTEGRATIONS: 'INTEGRATIONS',
  SYSTEM_LOG: 'SYSTEM_LOG'
}, REOS.CONFIG.SHEETS || {});

REOS.CONFIG.ROLES = Object.assign({
  ADMIN: 'Admin',
  AGENT: 'Agent',
  COORDINATOR: 'Transaction Coordinator',
  ASSISTANT: 'Assistant',
  ACCOUNTANT: 'Accountant'
}, REOS.CONFIG.ROLES || {});

REOS.CONFIG.IDS = Object.assign({
  CLIENT: 'C',
  CONTACT: 'C',
  LEAD: 'L',
  TASK: 'T',
  ACTIVITY: 'A',
  TRANSACTION: 'TX',
  COMMISSION: 'COM',
  PROPERTY: 'P',
  INVESTMENT: 'INV',
  RENTAL: 'R',
  LEASE: 'LEA',
  MAINTENANCE: 'MNT',
  FINANCE: 'FIN',
  DOCUMENT: 'DOC'
}, REOS.CONFIG.IDS || {});

REOS.getSheetName_ = function (key, fallback) {
  return (REOS.CONFIG && REOS.CONFIG.SHEETS && REOS.CONFIG.SHEETS[key]) || fallback || key;
};

REOS.getIdPrefix_ = function (key, fallback) {
  return (REOS.CONFIG && REOS.CONFIG.IDS && REOS.CONFIG.IDS[key]) || fallback || key;
};
