const fs = require('fs')
const path = require('path')
const log = require('fancy-log')
const { spawn } = require('child_process')

// TODO: add support for FW v5

module.exports = (gulp, config, plugins, options) => {
  const util = require('../lib/utilities')(config, options)

  // run a shell command, preserving output and failing the task on errors
  const exec = (command, done) => {
    log.info('$ ' + command)
    spawn(command, { stdio: 'inherit', shell: true }).on('exit', (code) => done(code > 0 ? 'Command failed [exit code ' + code + ']: ' + command : null))
  }

  // update framework subtree
  gulp.task('shell:update_framework', (done) => {
    let frameworkPath = path.join(process.cwd(), config.paths.src, config.paths.framework.base)
    let command = ''

    if (fs.existsSync(frameworkPath)) {
      let branch = options.branch || 'master'

      command = [
        'git fetch wc-plugin-framework ' + branch,
        'git status',
        // 'git subtree pull --prefix ' + 'lib/skyverge wc-plugin-framework ' + branch + ' --squash',
        'echo subtree up to date!'
      ].join(' && ')
    } else {
      command = 'echo no subtree to update'
    }

    exec(command, done)
  })

  // commit framework update
  gulp.task('shell:update_framework_commit', (done) => {
    let frameworkPath = path.join(process.cwd(), config.paths.src, config.paths.framework.base)
    let command = ''

    if (fs.existsSync(frameworkPath)) {
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + config.plugin.name + ': Update framework to v' + config.plugin.frameworkVersion + '"'
      ].join(' && ')
    } else {
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + config.pluginname + ': Update readme.txt"'
      ]
    }

    exec(command, done)
  })

  // commit framework update
  gulp.task('shell:update_framework_commit', (done) => {
    let frameworkPath = path.join(process.cwd(), config.paths.src, config.paths.framework.base)
    let command = ''

    if (fs.existsSync(frameworkPath)) {
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + config.plugin.name + ': Update framework to v' + config.plugin.frameworkVersion + '"'
      ].join(' && ')
    } else {
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + config.pluginname + ': Update readme.txt"'
      ]
    }

    exec(command, done)
  })

  // ensure the working copy (git tree) has no uncommited changes
  gulp.task('shell:git_ensure_clean_working_copy', (done) => {
    let command = [
      'git diff-index --quiet HEAD --'
    ].join(' && ')

    spawn(command, { stdio: 'inherit', shell: true }).on('exit', (code) => {
      if (!code) return done()

      exec('git status', () => {
        let err = new Error('Working copy is not clean!')
        err.showStack = false
        done(err)
      })
    })
  })

  // commit and push update
  gulp.task('shell:git_push_update', (done) => {
    let command = [
      'git add -A',
      'git commit -m "' + config.plugin.name + ': ' + util.getVersionBump() + ' Versioning"' + (options.release_issue_to_close ? ' -m "Closes #' + options.release_issue_to_close + '"' : ''),
      'git push',
      'echo git up to date!'
    ].join(' && ')

    exec(command, done)
  })

  // pull updates from WC repo
  gulp.task('shell:git_pull_wc_repo', (done) => {
    let command = [
      'cd ' + util.getWCRepoPath(),
      'git pull && git push'
    ].join(' && ')

    exec(command, done)
  })

  // commit and push update to WC repo
  gulp.task('shell:git_push_wc_repo', (done) => {
    let command = [
      'cd ' + util.getWCRepoPath(),
      'git pull',
      'git add -A',
      'git commit -m "Update ' + config.plugin.name + ' to ' + util.getVersionBump() + '"',
      'git push'
    ].join(' && ')

    exec(command, done)
  })

  // TODO: do we need this anymore?
  // commit and push update, ver 2
  gulp.task('shell:git_update_wc_repo', (done) => {
    let command = [
      'cd ' + util.getWCRepoPath(),
      'git pull',
      'git add -A',
      'git diff-index --quiet --cached HEAD || git commit -m "Updating ' + config.plugin.name + '"',
      'git push',
      'echo WooCommerce repo up to date!'
    ].join(' && ')

    exec(command, done)
  })

  // stash uncommitted changes
  gulp.task('shell:git_stash', (done) => {
    exec('git stash', done)
  })

  // apply latest stash
  gulp.task('shell:git_stash_apply', (done) => {
    exec('git stash apply', done)
  })

  gulp.task('shell:composer_install', (done) => {
    if (fs.existsSync(path.join(process.cwd(), 'composer.json'))) {
      exec('composer install', done)
    } else {
      log.info('No composer.json found, skipping composer install')
      done()
    }
  })
}
