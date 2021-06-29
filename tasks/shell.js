const fs = require('fs')
const path = require('path')
const log = require('fancy-log')
const shell = require('shelljs')
const _str = require('underscore.string')

module.exports = (gulp, plugins, sake) => {
  const awk = process.platform === 'win32' ? 'gawk' : 'awk'
  const noRunIfEmpty = process.platform !== 'darwin' ? '--no-run-if-empty ' : ''

  // run a shell command, preserving output and failing the task on errors
  const exec = (command, opts, done) => {
    log.info('$ ' + command)

    if (typeof opts === 'function') {
      done = opts
      opts = {}
    }

    shell.exec(command, opts, (code) => done(code > 0 ? 'Command failed [exit code ' + code + ']: ' + command : null))
  }

  // update framework subtree
  gulp.task('shell:update_framework', (done) => {
    if (!sake.config.framework) {
      sake.throwError('Not a frameworked plugin, aborting')
    }

    let command = ''

    if (sake.config.framework === 'v4') {
      let frameworkPath = path.join(process.cwd(), sake.config.paths.src, sake.config.paths.framework.base)

      if (fs.existsSync(frameworkPath)) {
        let branch = sake.options.branch || 'legacy-v4'
        let prefix = path.join((sake.config.multiPluginRepo ? sake.config.plugin.id : '.'), sake.config.paths.framework.base)

        command = [
          'git fetch wc-plugin-framework ' + branch,
          'git status',
          'git subtree pull --prefix ' + prefix + ' wc-plugin-framework ' + branch + ' --squash',
          'echo subtree up to date!'
        ]

        if (sake.config.multiPluginRepo) {
          command.unshift('cd ../')
        }

        command = command.join(' && ')
      } else {
        command = 'echo no subtree to update'
      }
    }

    exec(command, done)
  })

  // commit framework update
  gulp.task('shell:update_framework_commit', (done) => {
    let frameworkPath = path.join(process.cwd(), sake.config.paths.src, sake.config.paths.framework.base)
    let command = ''

    if (fs.existsSync(frameworkPath)) {
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + sake.config.plugin.name + ': Update framework to v' + sake.config.plugin.frameworkVersion + '"'
      ].join(' && ')
    } else {
      // TODO: is this still necessary? {IT 2018-03-21}
      command = [
        'git add -A',
        'git diff-index --quiet --cached HEAD || git commit -m "' + sake.config.plugin.name + ': Update readme.txt"'
      ]
    }

    exec(command, done)
  })

  // ensure the working copy (git tree) has no uncommited changes
  gulp.task('shell:git_ensure_clean_working_copy', (done) => {
    let command = [
      'git diff-index --quiet HEAD'
    ].join(' && ')

    shell.exec(command, (code) => {
      if (!code) return done()

      shell.exec('git status', () => {
        sake.throwError('Working copy is not clean!')
      })
    })
  })

  // commit and push update
  gulp.task('shell:git_push_update', (done) => {
    let command = [
      'git add -A',
      'git commit -m "' + sake.config.plugin.name + ': ' + sake.getVersionBump() + ' Versioning"' + (sake.options.release_issue_to_close ? ' -m "Closes #' + sake.options.release_issue_to_close + '"' : ''),
      'git push',
      'echo git up to date!'
    ].join(' && ')

    exec(command, done)
  })

  // pull updates from WC repo, or clone repo, if deploying for the first time
  gulp.task('shell:git_pull_wc_repo', (done) => {
    let command = []

    if (!fs.existsSync(sake.getProductionRepoPath())) {
      // ensure that the tmp dir exists
      if (!fs.existsSync(sake.config.paths.tmp)) {
        shell.mkdir('-p', sake.config.paths.tmp)
      }

      // repo does not exist yet
      command = [
        'cd ' + sake.config.paths.tmp,
        'git clone ' + sake.config.deploy.production.url
      ]
    } else {
      // repo already exists
      command = [
        'cd ' + sake.getProductionRepoPath(),
        'git pull && git push'
      ]
    }

    shell.exec(command.join(' && '), (code, stdout, stderr) => {
      // ignore missing ref error - this will happen when the remote repo is empty (for example, a new WC plugin)
      // and we try to `git pull`
      if (code === 1 && stderr.indexOf('Your configuration specifies to merge with the ref') > -1) {
        return done()
      } else {
        return done(code > 0 ? 'Command failed [exit code ' + code + ']: ' + command : null)
      }
    })
  })

  // commit and push update to WC repo
  gulp.task('shell:git_push_wc_repo', (done) => {
    let closeIssues = ''

    if (sake.options.wc_issues_to_close) {
      closeIssues = ' -m "' + _str.capitalize(sake.options.wc_issues_to_close.map((issue) => `closes #${issue}`).join(', ')) + '"'
    }

    // always ensure to pull the repo, but bypass the missing ref error
    gulp.series('shell:git_pull_wc_repo')((err) => {
      if (err) sake.throwError(err)

      let command = [
        'cd ' + sake.getProductionRepoPath(),
        'git add -A',
        'git commit -m "Update ' + sake.config.plugin.name + ' to ' + sake.getVersionBump() + '"' + closeIssues,
        'git push'
      ].join(' && ')

      exec(command, done)
    })
  })

  // TODO: do we need this anymore?
  // commit and push update, ver 2
  gulp.task('shell:git_update_wc_repo', (done) => {
    let command = [
      'cd ' + sake.getProductionRepoPath(),
      'git pull',
      'git add -A',
      'git diff-index --quiet --cached HEAD || git commit -m "Updating ' + sake.config.plugin.name + '"',
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

  gulp.task('shell:composer_status', (done) => {
    if (fs.existsSync(path.join(process.cwd(), 'composer.json'))) {
      exec('composer status -v', done)
    } else {
      log.info('No composer.json found, skipping composer status')
      done()
    }
  })

  gulp.task('shell:composer_install', (done) => {
    if (fs.existsSync(path.join(process.cwd(), 'composer.json'))) {
      exec('composer install --no-dev', done)
    } else {
      log.info('No composer.json found, skipping composer install')
      done()
    }
  })

  gulp.task('shell:composer_update', (done) => {
    if (fs.existsSync(path.join(process.cwd(), 'composer.json'))) {
      exec('composer update --no-dev', done)
    } else {
      log.info('No composer.json found, skipping composer update')
      done()
    }
  })

  gulp.task('shell:svn_checkout', (done) => {
    // ensure that the tmp dir exists
    if (!fs.existsSync(sake.config.paths.tmp)) {
      shell.mkdir('-p', sake.config.paths.tmp)
    }

    let command = 'svn co --force-interactive ' + sake.config.deploy.production.url + ' ' + sake.getProductionRepoPath()

    exec(command, done)
  })

  gulp.task('shell:svn_commit_trunk', (done) => {
    const commitMsg = 'Committing ' + sake.getPluginVersion() + ' to trunk'

    let command = [
      'cd ' + path.join(sake.getProductionRepoPath(), 'trunk'),
      'svn status | ' + awk + " '/^[?]/{print $2}' | xargs " + noRunIfEmpty + 'svn add',
      'svn status | ' + awk + " '/^[!]/{print $2}' | xargs " + noRunIfEmpty + 'svn delete',
      'svn commit --force-interactive --username="' + sake.config.deploy.production.user + '" -m "' + commitMsg + '"'
    ].join(' && ')

    exec(command, done)
  })

  gulp.task('shell:svn_commit_tag', (done) => {
    const commitMsg = 'Tagging ' + sake.getPluginVersion()

    let command = [
      'cd ' + path.join(sake.getProductionRepoPath(), 'tags', sake.getPluginVersion()),
      'svn add .',
      'svn commit --force-interactive --username="' + sake.config.deploy.production.user + '" -m "' + commitMsg + '"'
    ].join(' && ')

    exec(command, done)
  })

  gulp.task('shell:svn_commit_assets', (done) => {
    const commitMsg = 'Committing assets for ' + sake.getPluginVersion()

    let command = [
      'cd ' + path.join(sake.getProductionRepoPath(), 'assets'),
      'svn status | ' + awk + " '/^[?]/{print $2}' | xargs " + noRunIfEmpty + 'svn add',
      'svn status | ' + awk + " '/^[!]/{print $2}' | xargs " + noRunIfEmpty + 'svn delete',
      'svn commit --force-interactive --username="' + sake.config.deploy.production.user + '" -m "' + commitMsg + '"'
    ].join(' && ')

    exec(command, done)
  })
}
