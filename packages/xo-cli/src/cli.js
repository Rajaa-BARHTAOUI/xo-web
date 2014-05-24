'use strict';

//====================================================================

var _ = require('lodash');
var nomnom = require('nomnom')();
var Promise = require('bluebird');

//--------------------------------------------------------------------

var config = require('./config');
var prompt = require('./prompt');
var Xo = require('./xo');

//====================================================================

//`nomnom.print()` version which does not use `process.exit()`.
nomnom.print = function (str, code) {
  throw ''+ str;

  // TODO: handles code.
};

//====================================================================

var connect = function () {
  return config.load().bind({}).then(function (config) {
    if (!config.server)
    {
      throw 'no server to connect to!';
    }

    if (!config.token)
    {
      throw 'no token available';
    }

    this.xo = new Xo(config.server);

    return this.xo.send('session.signInWithToken', {
      token: config.token,
    });
  }).then(function () {
    return this.xo;
  }).bind();
};

//====================================================================

module.exports = function (argv) {
  var command;
  var commandName;
  var commandOpts;

  var registerCommand = function (name, def, fn) {
    var cmdParser = nomnom.command(name);

    if (def.description)
    {
      cmdParser.help(def.description);
    }

    if (def.args)
    {
      var interactive = process.stdin.isTTY;

      _.each(def.args, function (def, name) {
        cmdParser.option(name, {
          abbr: def.abbr,
          flag: (def.type === 'boolean'),
          help: def.description,

          // Do not mark options as required if the program is run in
          // interactive mode, they will be asked.
          required: !interactive && def.required,
        });
      });

      fn = (function (fn, args) {
        return function (opts) {
          var prompts = [];

          _.each(args, function (def, name) {
            if (!(name in opts))
            {
              prompts.push({
                name: name,
                message: def.prompt || def.description || name,
                type: def.promptType || 'input',
              });
            }
          });

          if (prompts.length)
          {
            return prompt(prompts).then(function (answers) {
              return fn(_.extend(opts, answers));
            });
          }

          return fn(opts);
        };
      })(fn, def.args);
    }

    cmdParser.callback(function (opts) {
      command = fn;
      commandName = name;
      commandOpts = opts;
    });
  };

  registerCommand('add-server', {
    description: 'adds a new Xen server',
    args: {
      host: {
        description: 'host of the server',
        required: true,
      },
      username: {
        description: 'username to use to connect',
        required: true,
      },
      password: {
        description: 'password to use to connect',
        promptType: 'password',
        required: true,
      },
    },
  }, function (opts) {
    return connect().then(function (connection) {
      return connection.send('server.add', {
        host: opts.host,
        username: opts.username,
        password: opts.password,
      });
    }).return('ok');
  });

  registerCommand('register', {
    description: 'registers the XO instance',
    args: {
      host: {
        description: 'host/ip optionally followed by `:port` if not 80',
        required: true,
      },
      email: {
        description: 'email to use to connect',
        required: true,
      },
      password: {
        description: 'password to use to connect',
        promptType: 'password',
        required: true,
      },
    }
  }, function (opts) {
    return Promise.bind({opts: opts || {}}).then(function () {
      this.xo = new Xo(opts.host);

      return this.xo.send('session.signInWithPassword', {
        email: this.opts.email,
        password: this.opts.password,
      });
    }).then(function (user) {
      console.log('Successfully logged with', user.email);

      return this.xo.send('token.create');
    }).then(function (token) {
      console.log('Token created:', token);

      return config.set({
        server: this.opts.host,
        token: token,
      });
    }).bind();
  });

  registerCommand('list-commands', {}, function () {
    return connect().then(function (xo) {
      return xo.send('system.listMethods').then(JSON.stringify);
    });
  });
  registerCommand('show-command', {
    args: {
      name: {
        required: true,
      },
    },
  }, function (opts) {
    return connect().then(function (xo) {
      return xo.send('system.methodSignature', {
        name: opts.name
      }).then(console.log);
    });
  });

  registerCommand('whoami', {
    description: 'displays information about the current user',
  }, function () {
    return connect().then(function (xo) {
      return xo.send('session.getUser');
    }).then(function (user) {
      if (user)
      {
        console.log('You are signed in as', user.email);
        console.log('Your global permission is', user.permission);
      }
      else
      {
        console.log('Your are not signed in.');
      }
    });
  });

  // TODO: handle global `--config FILE` option.
  var opts = nomnom
    .option('version', {
      flag: true,
      help: 'prints the current version of xo-cli',
    })
    .parse(argv)
  ;

  if (opts.version)
  {
    return 'xo-cli version '+ require('../package').version;
  }

  // Executes the selected command.
  return command(commandOpts);
};
