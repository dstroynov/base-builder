'use strict';

const fs = require('fs'),
      path = require('path'),
      argv = require('optimist').argv,
      chalk = require('chalk'),
      child = require('child_process'),
      readlineSync = require('readline-sync'),
      mustache = require('mustache'),
      mkdirp = require('mkdirp'),
      Spinner = require('cli-spinner').Spinner,
      _ = require('lodash'),
      randomstring = require('randomstring'),

      ERROR_CODE_NOT_ENOUGH_ARGUMENTS = 1,
      ERROR_CODE_TOO_MANY_ARGUMENTS = 2,
      ERROR_CODE_DIRECTORY_EXISTS = 3,
      ERROR_CODE_DIRECTORY_CREATING_FAILED = 4,
      ERROR_CODE_NODE_MODULES_INSTALLATION_FAILED = 5,

      params = {};

function getProjectName() {
  if (argv._.length < 1) {
    console.error(
      `${chalk.bold.dim.red('Not enough arguments \u2718')}\n\nUsage: base-builder [project-name]`
    );
    process.exit(ERROR_CODE_NOT_ENOUGH_ARGUMENTS);
  } else if (argv._.length > 1) {
    console.error(
      `${chalk.red('Too many arguments \u2718')}\n\nUsage: base-builder [project-name]`
    );
    process.exit(ERROR_CODE_TOO_MANY_ARGUMENTS);
  }
  return argv._[0];
}

function checkDirectory() {
  params.projectName = getProjectName();

  if (fs.existsSync(params.projectName)) {
    console.error(chalk.red(`Directory "${params.projectName}" already exists \u2718`));
    process.exit(ERROR_CODE_DIRECTORY_EXISTS);
  }
}

function buildParams() {
  params.sessionSecretDev = randomstring.generate();
  params.sessionSecretProd = randomstring.generate();

  const indent = [
    [2, '  ', 2, '    ', 3, '      '],
    [4, '    ', 1, '    ', 1, '    '],
    ['tab', '\t', 1, '\t', 1, '\t']
  ][
    readlineSync.keyInSelect(
      ['2 spaces', '4 spaces', 'tab'],
      chalk.green('Select indentation size'),
      { cancel: false }
    )
  ];

  params.indentSize = indent[0];
  params.indent = indent[1];
  params.indentLetSize = indent[2];
  params.indentLet = indent[3];
  params.indentConstSize = indent[4];
  params.indentConst = indent[5];

  params.eslinter = readlineSync.keyInYNStrict(
    chalk.green('Do you want to use eslinter? (recommended to use)')
  );

  // server questions
  params.useCluster = readlineSync.keyInYNStrict(
    chalk.green('Do you want to enable cluster? (recommended to enable)')
  );

  params.oauth = readlineSync.keyInYNStrict(chalk.green('Do you need OAuth support?'));

  params[
    ['mysql', 'mongodb', 'redis', 'couchdb', '_'][
      readlineSync.keyInSelect(
        ['MySQL', 'MongoDb', 'Redis', 'CouchDB', 'None of these'],
        chalk.green('Which database do you want to use'),
        { cancel: false }
      )
    ]
  ] = true;
  params.database = !params._;

  params[
    ['sessionMysql', 'sessionMongodb', 'sessionRedis', '_'][
      readlineSync.keyInSelect(
        ['MySQL', 'MongoDb', 'Redis', 'In-memory store'],
        chalk.green('Which database do you want to use for sessions'),
        { cancel: false }
      )
    ]
  ] = true;
}

function render(file, callback) {
  fs.readFile(`${__dirname}/${file}.mst`, 'utf8', (readErr, template) => {
    if (readErr) {
      console.log(file + chalk.bold.red(' \u2718 '));
      throw readErr;
    }

    callback(mustache.render(template, params));
  });
}

function createDirectory() {
  const msg = chalk.bold.yellow('Creating git-repository...'),
        spinner = new Spinner(`${msg} %s`);
  let status = 0;

  spinner.start(100);
  status = child.spawnSync('git', ['init', params.projectName]).status;
  spinner.stop(true);

  if (status === 0) {
    console.log(msg + chalk.bold.green(' \u2714 '));
  } else {
    console.log(msg + chalk.bold.red(' \u2718 '));
    process.exit(ERROR_CODE_DIRECTORY_CREATING_FAILED);
  }

  process.chdir(params.projectName);
}

function installModules() {
  const msg = chalk.bold.yellow('Installing node modules...'),
        spinner = new Spinner(`${msg} %s`);

  render('packages.json', (list) => {
    const packages = JSON.parse(list);

    spinner.start(100);
    child.spawn('npm', ['install', '--save'].concat(packages)).on('close', (status) => {
      spinner.stop(true);

      if (status === 0) {
        console.log(msg + chalk.bold.green(' \u2714 '));
      } else {
        console.log(msg + chalk.bold.red(' \u2718 '));
        process.exit(ERROR_CODE_NODE_MODULES_INSTALLATION_FAILED);
      }
    });
  });
}

function copyFiles() {
  console.log(chalk.bold.yellow('Copying files:'));
  render('filelist.json', (list) => {
    const files = JSON.parse(list),
          done = _.after(files.length, installModules);

    files.forEach((i) => render(`templates/${i}`, (data) => {
      mkdirp(path.dirname(i), dirErr => {
        if (dirErr) {
          console.log(chalk.bold.red(' \u2718 ') + i);
          throw dirErr;
        }

        fs.writeFile(i, data, writeErr => {
          if (writeErr) {
            console.log(i + chalk.bold.red(' \u2718 '));
            throw writeErr;
          }
          console.log(i + chalk.bold.green(' \u2714 '));
          done();
        });
      });
    }));
  });
}

checkDirectory();
buildParams();
createDirectory();
copyFiles();
