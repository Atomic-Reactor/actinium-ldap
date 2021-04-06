const chalk = require('chalk');
const op = require('object-path');

const PLUGIN = {
    ID: 'Ldap',
    description:
        'Provides a simple LDAP server against Actinium user collection.',
    name: 'Ldap Plugin',
    order: Actinium.Enums.priority.low,
    version: {
        actinium: '>=3.2.6',
        plugin: '0.0.1',
    },
    bundle: [],
    meta: {
        builtIn: false,
    },
};

/**
 * ----------------------------------------------------------------------------
 * Extend Actinium SDK
 * ----------------------------------------------------------------------------
 */
const PLUGIN_SDK = require('./sdk');
Actinium.LDAP = op.get(Actinium, 'LDAP', PLUGIN_SDK);

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

Actinium.Hook.register('plugin-load', plugin => {
    if (PLUGIN.ID !== plugin.ID) return;
    Actinium.LDAP.init();
});

Actinium.Hook.register('start', () => {
    if (Actinium.Plugin.isActive(PLUGIN.ID)) {
        Actinium.LDAP.start();
    }
});

Actinium.Hook.register('ldap-before-start', async server => {
    // debug middleware
    server.use(Actinium.LDAP.debugMiddleware);

    // default bind (authentication, no authorization)
    const anonBindDN = op.get(ENV, 'LDAP_ANONMOUS_BIND_DN', 'cn=default');
    const baseDN = op.get(ENV, 'LDAP_USERS_BASE_DN', 'ou=users,dc=reactium,dc=io');
    server.search(baseDN, Actinium.LDAP.searchUsers);
    server.bind(anonBindDN, (req, res, next) => {
        DEBUG(`Anonymous LDAP bind to ${anonBindDN}`);
        res.end();
        next();
    });

    server.bind(baseDN, Actinium.LDAP.bindUsers);
});
