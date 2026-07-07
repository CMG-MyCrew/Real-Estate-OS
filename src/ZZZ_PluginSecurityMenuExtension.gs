/**
 * REOS Enterprise v3.3.2 - Plugin Access Menu Extension
 * Adds plugin access controls to the registry without replacing Menu.gs.
 */

var REOS = REOS || {};

(function () {
  if (!REOS.MenuRegistry || typeof REOS.MenuRegistry.registerItem !== 'function') return;
  REOS.MenuRegistry.registerItem('plugins', { label: 'Plugin Security Sync', functionName: 'reosPluginSecuritySync' });
  REOS.MenuRegistry.registerItem('plugins', { label: 'Plugin Security Summary', functionName: 'reosPluginSecuritySummary' });
  REOS.MenuRegistry.registerItem('plugins', { label: 'Plugin Security Test', functionName: 'reosPluginSecurityTest' });
})();
