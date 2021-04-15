const fs = require('fs');
const ldap = require('ldapjs');
const chalk = require('chalk');
const op = require('object-path');
const _ = require('underscore');

let ldapServer;
let ldapConfig;

const LDAP = {
    config() {
        if (ldapConfig) return ldapConfig;

        ldapConfig = op.get(ENV, 'LDAP_SERVER_OPTIONS', {});

        ldapConfig.ldapPort = op.get(ENV, 'LDAP_PORT', 1389);

        // Default base distinguished name (i.e. location in tree to start)
        ldapConfig.baseDN = op.get(
            ENV,
            'LDAP_USERS_BASE_DN',
            op.get(ldapConfig, 'baseDN', 'ou=users,dc=reactium,dc=io'),
        );

        // A user that can be used for LDAP clients that insist on binding to something
        ldapConfig.anonBindDN = op.get(
            ENV,
            'LDAP_ANONMOUS_BIND_DN',
            op.get(ldapConfig, 'anonBindDN', 'cn=default'),
        );

        ldapConfig.rootBindUser = op.get(
            ENV,
            'LDAP_ROOT_BIND_USER',
            op.get(ldapConfig, 'rootBindUser', 'root'),
        );

        ldapConfig.rootPasswordFile = op.get(
            ENV,
            'LDAP_ROOT_BIND_PASSWORD_FILE',
        );

        const serverOptions = {};
        ldapConfig.serverOptions = serverOptions;

        if (
            ldapConfig.rootPasswordFile &&
            fs.existsSync(ldapConfig.rootPasswordFile)
        ) {
            ldapConfig.rootPassword = String(
                fs.readFileSync(ldapConfig.rootPasswordFile, 'utf8'),
            ).trim();
        }

        ldapConfig.tls = false;
        if (
            ldapConfig.certFile &&
            fs.existsSync(ldapConfig.certFile) &&
            ldapConfig.keyFile &&
            fs.existsSync(ldapConfig.keyFile)
        ) {
            ldapConfig.tls = true;
            serverOptions.certificate = fs.readFileSync(
                ldapConfig.certFile,
                'utf8',
            );
            serverOptions.key = fs.readFileSync(ldapConfig.keyFile, 'utf8');
        }

        return ldapConfig;
    },

    init() {
        const { serverOptions } = LDAP.config();
        if (!ldapServer) {
            ldapServer = ldap.createServer(serverOptions);
        }
    },

    async start() {
        const { ldapPort } = LDAP.config();

        if (!ldapServer) {
            ERROR('No LDAP server object. Did you call Actinium.LDAP.init()?');
            return;
        }

        await Actinium.Hook.run('ldap-before-start', ldapServer);

        ldapServer.listen(ldapPort, function() {
            BOOT(chalk.cyan('LDAP'), `Listening at ${ldapServer.url}`);
        });

        await Actinium.Hook.run('ldap-started', ldapServer);
    },

    async debugMiddleware(req, res, next) {
        INFO(typeof req);
        DEBUG(req);
        next();
    },

    async bindRoot(req, res, next) {
        const { rootPassword } = LDAP.config();
        if (!rootPassword || req.credentials !== rootPassword) {
            return next(new ldap.InvalidCredentialsError());
        }

        res.end();
        return next();
    },

    async bindUsers(req, res, next) {
        const { baseDN } = LDAP.config();

        // shouldn't be possible but here to be extra
        if (!req.dn.childOf(baseDN)) {
            return next(new ldap.InvalidCredentialsError());
        }

        const pattern = /^cn=(.+?),/i;
        const dn = req.dn.toString();
        const [, match] = dn.match(pattern);
        if (match) {
            try {
                const user = await Parse.User.logIn(match, req.credentials);
                if (user) {
                    INFO(
                        chalk.green.bold('LDAP bind to user:'),
                        `user ${match}: (${dn})`,
                    );
                    res.end();
                    return next();
                }
            } catch (error) {}
        }

        ERROR(chalk.red.bold('LDAP bind error:'), `for dn ${dn}`);
        return next(new ldap.InvalidCredentialsError());
    },

    _buildQuery(filter, query, cn = '_User') {
        let attribute = filter.attribute;
        if (cn === '_User' && attribute === 'uid') attribute = 'username';

        switch (filter.type) {
        case 'and': {
            return Parse.Query.and(
                ...filter.filters.map(filter =>
                    LDAP._buildQuery(filter, null, cn),
                ),
            );
        }

        case 'or': {
            return Parse.Query.or(
                ...filter.filters.map(filter =>
                    LDAP._buildQuery(filter, null, cn),
                ),
            );
        }

        case 'present': {
            query = new Parse.Query(cn);
            query.exists(attribute);

            return query;
        }

        case 'substring': {
            query = new Parse.Query(cn);
            query.containsAllStartingWith(
                attribute,
                _.compact([filter.initial, ...filter.any, filter.final]),
            );

            return query;
        }

        case 'approx': {
            query = new Parse.Query(cn);
            query.contains(attribute, filter.value);
            return query;
        }

        case 'equal': {
            query = new Parse.Query(cn);
            query.equalTo(attribute, filter.value);
            return query;
        }

        case 'not': {
            query = new Parse.Query(cn);
            query.notEqualTo(attribute, filter.value);
            return query;
        }

        case 'ge': {
            query = new Parse.Query(cn);
            query.greaterThanOrEqualTo(attribute, filter.value);
            return query;
        }

        case 'le': {
            query = new Parse.Query(cn);
            query.lessThanOrEqualTo(attribute, filter.value);
            return query;
        }

        default:
            return query;
        }
    },

    async searchUsers(req, res, next) {
        const { baseDN, rootBindUser } = LDAP.config();
        const filter = req.filter;

        // Bailout for rootBindUser (don't try Parse)
        if (
            rootBindUser &&
            filter.type === 'equal' &&
            filter.attribute === 'uid' &&
            filter.value === rootBindUser
        ) {
            const dn = `cn=${rootBindUser},${baseDN}`;
            res.send({
                dn,
                attributes: {
                    cn: rootBindUser,
                    uid: rootBindUser,
                    role: ['super-admin'],
                },
            });

            res.end();
            return next();
        }

        const query = LDAP._buildQuery(filter);
        if (query) {
            try {
                const user = await query.first();
                const obj = Actinium.Utils.serialize(user);
                const dn = `cn=${obj.username},${baseDN}`;
                const entry = {
                    dn,
                    attributes: {
                        cn: obj.username,
                        uid: obj.username,
                        role: Object.keys(op.get(obj, 'roles', {})).filter(
                            r => r !== 'anonymous',
                        ),
                        capability: op
                            .get(obj, 'capabilities', [])
                            .map(cap => cap.group),
                    },
                };

                res.send(entry);
                res.end();
                return next();
            } catch (error) {}
        }

        res.end();
        return next();
    },
};

module.exports = LDAP;
