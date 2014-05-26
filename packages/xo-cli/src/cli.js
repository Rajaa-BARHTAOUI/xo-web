'use strict';

//====================================================================

var _ = require('lodash');
var Promise = require('bluebird');
var multiline = require('multiline');
var chalk = require('chalk');

//--------------------------------------------------------------------

var config = require('./config');
var prompt = require('./prompt');
var Xo = require('./xo');

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

    return this.xo.call('session.signInWithToken', {
      token: config.token,
    });
  }).then(function () {
    return this.xo;
  }).bind();
};

var wrap = function (val) {
  return function () {
    return val;
  };
};

//====================================================================

exports = module.exports = function (args) {
  if (!args || !args.length) {
    return help();
  }

  var fnName = args[0].replace(/^--|-\w/g, function (match) {
    if (match === '--')
    {
      return '';
    }

    return match[1].toUpperCase();
  });
  if (fnName in exports) {
    return exports[fnName](args.slice(1));
  }

  return exports.call(args);
};

//--------------------------------------------------------------------

var help = exports.help = wrap(multiline.stripIndent(function () {/*
  Usage:

    xo-cli --register [<XO-Server URL>] [<username>] [<password>]
      Registers the XO instance to use.

    xo-cli --list-commands [--json]
      Returns the list of available commands on the current XO instance.

    xo-cli <command> [<name>=<value>]...
      Executes a command on the current XO instance.
*/}));

exports.version = wrap('xo-cli v'+ require('../package').version);

exports.register = function (args) {
};

exports.listCommands = function (args) {
  return connect().then(function (xo) {
    return xo.call('system.getMethodsInfo');
  }).then(function (methods) {
    if (args.indexOf('--json') !== -1)
    {
      return methods;
    }

    methods = _.pairs(methods);
    methods.sort(function (a, b) {
      a = a[0];
      b = b[0];
      if (a < b) {
        return -1;
      }
      return +(a > b);
    });

    var str = [];
    methods.forEach(function (method) {
      var name = method[0];
      var info = method[1];
      str.push(chalk.bold.blue(name));
      _.each(info.params || [], function (info, name) {
        str.push(' ');
        if (info.optional) {
          str.push('[');
        }
        str.push(name, '=<', info.type || 'unknown', '>');
        if (info.optional) {
          str.push(']');
        }
      });
      str.push('\n');
      if (info.description) {
        str.push('  ', info.description, '\n');
      }
    });
    return str.join('');
  });
};

var PARAM_RE = /^([^=]+)=(.*)$/;
exports.call = function (args) {
  if (!args.length) {
    throw 'missing command name';
  }

  var method = args.shift();
  var params = {};
  args.forEach(function (arg) {
    var matches;
    if (!(matches = arg.match(PARAM_RE))) {
      throw 'invalid arg: '+arg;
    }
    params[matches[1]] = matches[2];
  });

  return connect().then(function (xo) {
    return xo.call(method, params);
  });
};
