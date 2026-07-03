/**
 * REOS Enterprise v3.0 - Configuration
 */

var REOS = REOS || {};

REOS.CONFIG = {
  APP: {
    NAME: 'REOS Enterprise',
    VERSION: '3.0.0',
    TIME_ZONE: 'America/New_York'
  },

  SHEETS: {
    HOME: 'HOME',
    SETTINGS: 'SETTINGS',
    USERS: 'USERS',
    LOOKUPS: 'LOOKUPS',
    CRM: 'CRM',
    LEADS: 'LEADS',
    TASKS: 'TASKS',
    ACTIVITIES: 'ACTIVITIES',
    SYSTEM_LOG: 'SYSTEM_LOG'
  },

  ROLES: {
    ADMIN: 'Admin',
    AGENT: 'Agent',
    COORDINATOR: 'Transaction Coordinator',
    ASSISTANT: 'Assistant',
    ACCOUNTANT: 'Accountant'
  },

  IDS: {
    CLIENT: 'C',
    LEAD: 'L',
    TASK: 'T',
    ACTIVITY: 'A',
    TRANSACTION: 'TX',
    PROPERTY: 'P'
  }
};

REOS.getProperty_ = function (key) {
  return PropertiesService.getScriptProperties().getProperty(key);
};

REOS.setProperty_ = function (key, value) {
  PropertiesService.getScriptProperties().setProperty(key, String(value));
};
