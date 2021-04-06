const fs = require('fs');
const ldap = require('ldapjs');
const chalk = require('chalk');
const op = require('object-path');

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
        console.log(filter.type, filter.attribute);
        let attribute = filter.attribute;
        if (cn === '_User' && attribute === 'uid') attribute = 'username';

        switch (filter.type) {
        case 'and': {
            return new Parse.Query.and(
                ...filter.filters.map(filter =>
                    LDAP._buildQuery(filter, null, cn),
                ),
            );
        }

        case 'present':
        case 'substring': {
            query = new Parse.Query(cn);
            query.contains(attribute, filter.value);
            return query;
        }

        case 'approx':
        case 'equal': {
            query = new Parse.Query(cn);
            query.equalTo(attribute, filter.value);
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
        const query = LDAP._buildQuery(req.filter);

        if (query) {
            try {
                const user = await query.first();
                console.log({ user });
            } catch (error) {}
        }

        // if (req.filter.matches(entry.attributes)) {
        //     console.log('searching users for this thingy');
        //     res.send(entry);
        //     res.end();
        // } else {
        //     console.log('filter', req.filter);
        //     return next(new ldap.NoSuchObjectError());
        // }

        res.end();
        return next();
    },
};

module.exports = LDAP;
