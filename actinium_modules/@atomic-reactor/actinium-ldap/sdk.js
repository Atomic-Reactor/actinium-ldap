const fs = require('fs');
const ldap = require('ldapjs');
const chalk = require('chalk');
const op = require('object-path');
const _ = require('underscore');

let server;
const LDAP = {
    init() {
        if (!server) {
            const serverOptions = fs.existsSync(
                '/etc/letsencrypt/live/auth.reactium.io/fullchain.pem',
            )
                ? {
                    certificate: fs.readFileSync(
                        '/etc/letsencrypt/live/auth.reactium.io/fullchain.pem',
                    ),
                    key: fs.readFileSync(
                        '/etc/letsencrypt/live/auth.reactium.io/privkey.pem',
                    ),
                }
                : {};

            server = ldap.createServer(serverOptions);
        }
    },

    async start() {
        if (!server) {
            ERROR('No LDAP server object. Did you call Actinium.LDAP.init()?');
            return;
        }

        await Actinium.Hook.run('ldap-before-start', server);

        server.listen(1389, function() {
            BOOT(chalk.cyan('LDAP'), `Listening at ${server.url}`);
        });

        await Actinium.Hook.run('ldap-started', server);
    },

    async debugMiddleware(req, res, next) {
        console.log('LDAP.debugMiddleware');
        INFO(typeof req);
        // DEBUG(req);
        next();
    },

    async bindUsers(req, res, next) {
        const baseDN = op.get(
            ENV,
            'LDAP_USERS_BASE_DN',
            'ou=users,dc=reactium,dc=io',
        );

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
        const baseDN = op.get(
            ENV,
            'LDAP_USERS_BASE_DN',
            'ou=users,dc=reactium,dc=io',
        );
        const query = LDAP._buildQuery(req.filter);

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
