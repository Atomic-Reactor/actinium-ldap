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

Actinium.Hook.register(
    'warning',
    () => {
        if (!Actinium.Plugin.isActive(PLUGIN.ID)) return;

        const { tls } = Actinium.LDAP.config();
        if (!tls) {
            WARN('');
            WARN(
                chalk.cyan.bold('Warning:'),
                'It is recommended that you run actinium-ldap in TLS (SSL) mode.',
                chalk.red.bold('Logins over LDAP will not be encrypted!'),
            );
            WARN(
                '  Set the env.json variables',
                `${chalk.cyan.bold(
                    'LDAP_SERVER_OPTIONS.certFile',
                )} (path to certificate)`,
                'and',
                `${chalk.cyan.bold(
                    'LDAP_SERVER_OPTIONS.keyFile',
                )} (path to private key)`,
            );
            WARN(
                chalk.magenta.bold(
                    '  Make sure these files exists and are readable.',
                ),
            );
        }
    },
    1000000000,
);

Actinium.Hook.register('ldap-before-start', async server => {
    const {
        baseDN, // the default DN search path
        anonBindDN, // the DN for permissive anonymous binds
        rootBindUser, // the user CN for the "root" super-admin LDAP response
        rootPassword, // the password for the "root" super-admin LDAP login
    } = Actinium.LDAP.config();

    // debug middleware
    server.use(Actinium.LDAP.debugMiddleware);

    if (rootBindUser && rootPassword) {
        // authenticate "root" LDAP user (will not be in Parse DB)
        server.bind(`cn=${rootBindUser},${baseDN}`, Actinium.LDAP.bindRoot);
    }

    // default bind (authentication, no authorization)
    server.search(baseDN, Actinium.LDAP.searchUsers);

    server.bind(anonBindDN, (req, res, next) => {
        DEBUG(`Anonymous LDAP bind to ${anonBindDN}`);
        res.end();
        next();
    });

    server.bind(baseDN, Actinium.LDAP.bindUsers);
});
