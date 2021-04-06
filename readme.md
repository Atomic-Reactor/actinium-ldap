# Actinium LDAP

This plugin adds a simple LDAP server to your Actinium instance, primarily for querying and
authenticating users.

## Install

From the root of your Actinium server instance:

```
arcli install -s @atomic-reactor/actinium-ldap
```

Jump over to the official [documentation](https://docs.reactium.io/get-started/install-actinium) for help with installing, extending Actinium.

## Configure

|Option |Default  | Description|
|:--- | ---: | :---:|
| **LDAP_ANONMOUS_BIND_DN** | "cn=default" | The distinguished name (DN) of the anonymous bind address. Some LDAP clients will want to login to something to do something. This can be a helpful dn that will authenticate anything. |
| **LDAP_USERS_BASE_DN** | "ou=users,dc=reactium,dc=io" | The base DN where to start to search for users. |
| **LDAP_PORT** | 1389 | The listening TCP port where the LDAP will accept request. Should be > 1024 |
| **LDAP_ROOT_BIND_USER** | "root" | If you wish to have an LDAP response that should work regardless of the state of your Actinium users, provide this user. Useful for a super-user account (external to Actinium APIs) controlled by configuration. |
| **LDAP_ROOT_BIND_PASSWORD_FILE** | (none) | The full path to the file that will contain the "root" password for the LDAP server. |
| **LDAP_SERVER_OPTIONS** | {} | Object where you can specify your TLS `certFile` and private `keyFile`. TLS is highly recommended, because LDAP will otherwise get passwords over plaintext. |

Example additions to your src/env.json file.
```
{
    "LDAP_ANONMOUS_BIND_DN": "cn=default",
    "LDAP_USERS_BASE_DN": "ou=users,dc=reactium,dc=io",
    "LDAP_PORT": 1389,
    "LDAP_ROOT_BIND_USER": "root",
    "LDAP_ROOT_BIND_PASSWORD_FILE": "/path/to/plaintext/password",
    "LDAP_SERVER_OPTIONS": {
        "certFile": "/path/to/fullchain.pem",
        "keyFile": "/path/to/privkey.pem"
    }
}
```
