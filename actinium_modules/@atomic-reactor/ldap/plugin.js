const chalk = require('chalk');
const op = require('object-path');
const { CloudRunOptions } = require(`${ACTINIUM_DIR}/lib/utils`);


const PLUGIN = {
    ID: 'Ldap',
    description: 'Provides an LDAP server against Actinium user collection.',
    name: 'Ldap Plugin',
    order: 100,
    version: {
        actinium: '>=3.2.6',
        plugin: '0.0.1',
    },
    bundle: [],
    meta: {
        builtIn: false
    },
};

/**
 * ----------------------------------------------------------------------------
 * Extend Actinium SDK
 * ----------------------------------------------------------------------------
 */
const PLUGIN_SDK = require('./sdk');
Actinium['Ldap'] = op.get(Actinium, 'Ldap', PLUGIN_SDK);


/**
 * ----------------------------------------------------------------------------
 * Plugin registration
 * ----------------------------------------------------------------------------
 */
Actinium.Plugin.register(PLUGIN, false);

/**
 * ----------------------------------------------------------------------------
 * Hook registration
 * ----------------------------------------------------------------------------
 */



Actinium.Hook.register('warning', () => {
    if (!Actinium.Plugin.isActive(PLUGIN.ID)) return;

    // Your bootstrap warning messages here
    // WARN('');
    // WARN(chalk.cyan.bold('Warning:'), 'about something');
});

Actinium.Hook.register('install', ({ ID }) => {
    if (ID !== PLUGIN.ID) return;

    // Your install code here
});

Actinium.Hook.register('uninstall', async ({ ID }) => {
    if (ID !== PLUGIN.ID) return;

    // Your uninstall code here
});

Actinium.Hook.register('activate', ({ ID }) => {
    if (ID !== PLUGIN.ID) return;

    // Your activation code here
});






