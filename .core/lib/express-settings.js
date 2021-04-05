const chalk = require('chalk');

module.exports = {
    init: (app, opt) => {
        const options = { ...ENV.EXPRESS_OPTIONS, ...opt };
        Object.entries(options).forEach(([key, value]) => {
            app.set(key, value);
            BOOT(
                chalk.cyan('  Express'),
                `${key}`,
                chalk.cyan('→'),
                chalk.magenta(value),
            );
        });
    },
};
