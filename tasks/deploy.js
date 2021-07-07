const fs = require('fs')
const log = require('fancy-log')
const dateFormat = require('dateformat')
const _ = require('lodash')
const chalk = require('chalk')
const axios = require('axios')

module.exports = (gulp, plugins, sake) => {
  let validatedEnvVariables = false

  // TODO: consider setting these variables in the sake.config on load instead, and validating sake.config vars instead
  // validate env variables before deploy
  function validateEnvVariables() {
    if (validatedEnvVariables) return

    let variables = ['GITHUB_API_KEY', 'GITHUB_USERNAME', 'SAKE_PRE_RELEASE_PATH']

    if (sake.config.deploy.type === 'wc') {
      variables = variables.concat(['WC_CONSUMER_KEY', 'WC_CONSUMER_SECRET'])
    }

    if (sake.config.deploy.type === 'wp') {
      variables = variables.concat(['WP_SVN_USER'])
    }

    sake.validateEnvironmentVariables(variables)
  }

  // deploy the plugin
  gulp.task('deploy', (done) => {
    validateEnvVariables()

    if (!sake.isDeployable()) {
      sake.throwError('Plugin is not deployable: \n * ' + sake.getChangelogErrors().join('\n * '))
    }

    // indicate that we are deploying
    sake.options.deploy = true
    // ensure scripts and styles are minified
    sake.options.minify = true

    let tasks = [
      // preflight checks, will fail the deploy on errors
      'deploy:preflight',
      // ensure version is bumped
      'bump',
      // fetch the latest WP/WC versions & bump the "tested up to" values
      'fetch_latest_wp_wc_versions',
      'bump:minreqs',
      // prompt for the version to deploy as
      'prompt:deploy',
      function (cb) {
        if (sake.options.version === 'skip') {
          log.error(chalk.red('Deploy skipped!'))
          return done()
        }
        cb()
      },
      // replace version number & date
      'replace:version',
      // delete prerelease, if any
      'clean:prerelease',
      // build the plugin - compiles and copies to build dir
      'build',
      // ensure the required framework version is installed
      'deploy:validate_framework_version',
      // grab issues to close with commit
      'github:get_rissue',
      // git commit & push
      'shell:git_push_update',
      // rebuild plugin configuration (version number, etc)
      function rebuildPluginConfig(cb) {
        sake.buildPluginConfig()
        cb()
      },
      // create the zip, which will be attached to the releases
      'compress',
      // create releases, attaching the zip
      'deploy_create_releases'
    ]

    if (sake.config.deploy.wooId && sake.config.deploy.type === 'wc') {
      tasks.push('prompt:wc_upload')
    }

    if (sake.config.deploy.type === 'wp') {
      tasks.push('deploy_to_wp_repo')
    }

    // finally, create a docs issue, if necessary
    tasks.push('github:docs_issue')

    return gulp.series(tasks)(done)
  })

  // run deploy preflight checks
  gulp.task('deploy:preflight', (done) => {
    let tasks = [
      'shell:git_ensure_clean_working_copy',
      'lint:scripts',
      'lint:styles'
    ]

    if (sake.config.deploy.type === 'wc') {
      tasks.unshift('search:wt_update_key')
    }

    gulp.parallel(tasks)(done)
  })

  gulp.task('deploy:validate_framework_version', (done) => {
    if (sake.config.framework === 'v5' && sake.getFrameworkVersion() !== sake.getRequiredFrameworkVersion()) {
      sake.throwError('Required framework version in composer.json (' + sake.getRequiredFrameworkVersion() + ') and installed framework version (' + sake.getFrameworkVersion() + ') do not match. Halting deploy.')
    }

    done()
  })

  // internal task for making sure the WT updater keys have been set
  gulp.task('search:wt_update_key', (done) => {
    fs.readFile(`${sake.config.paths.src}/${sake.config.plugin.mainFile}`, 'utf8', (err, data) => {
      if (err) sake.throwError(err)

      // matches " * Woo: ProductId:ProductKey" in the main plugin file PHPDoc
      let phpDocMatch = data.match(/\s*\*\s*Woo:\s*\d*:(.+)/ig)
      // matches legacy woothemes_queue_update() usage in the main plugin file
      let phpFuncMatch = data.match(/woothemes_queue_update\s*\(\s*plugin_basename\s*\(\s*__FILE__\s*\)\s*,\s*'(.+)'\s*,\s*'(\d+)'\s*\);/ig)

      // throw an error if no WT keys have been found with either method
      if (!phpDocMatch && !phpFuncMatch) {
        sake.throwError('WooThemes updater keys for the plugin have not been properly set ;(')
      }

      done()
    })
  })

  // internal task for replacing version and date when deploying
  gulp.task('replace:version', () => {
    if (!sake.getVersionBump()) {
      sake.throwError('No version replacement specified')
    }

    const versions = sake.getPrereleaseVersions(sake.getPluginVersion())
    const versionReplacements = versions.map(version => {
      return { match: version, replacement: () => sake.getVersionBump() }
    })

    const filterChangelog = plugins.filter('**/{readme.md,readme.txt,changelog.txt}', { restore: true })
    const date = dateFormat(new Date(), 'yyyy.mm.dd')

    return gulp.src([
      `${sake.config.paths.src}/**/*.php`,
      `${sake.config.paths.src}/readme.md`,
      `${sake.config.paths.src}/readme.txt`,
      `${sake.config.paths.src}/changelog.txt`,
      `${sake.config.paths.assetPaths.js}/**/*.{coffee,js}`,
      `!${sake.config.paths.assetPaths.js}/**/*.min.js`,
      `${sake.config.paths.assetPaths.css}/**/*.scss`,
      `${sake.config.paths.assetPaths.css}/**/*.css`,
      `!${sake.config.paths.src}/lib/**`,
      `!${sake.config.paths.src}/vendor/**`,
      `!${sake.config.paths.src}/tests/**`,
      `!${sake.config.paths.src}/node_modules/**`,
      `!${sake.config.paths.src}/*.json`,
      `!${sake.config.paths.src}/*.xml`,
      `!${sake.config.paths.src}/*.yml`
    ], { base: './', allowEmpty: true })
      // unlike gulp-replace, gulp-replace-task supports multiple replacements
      .pipe(plugins.replaceTask({ patterns: versionReplacements, usePrefix: false }))
      .pipe(filterChangelog)
      .pipe(plugins.replace(/[0-9]+\.nn\.nn/, date))
      .pipe(filterChangelog.restore)
      .pipe(gulp.dest('./'))
  })

  /**
   * Grab any issues to close with the deploy
   */
  gulp.task('get_issues_to_close', (done) => {
    let tasks = ['github:get_rissue']

    if ('wc' == sake.config.deploy.type) {
      tasks.push('github:get_wc_issues')
    }

    gulp.series(tasks)(done)
  })

  /**
   * Create releases for a deploy
   *
   * This task is especially useful if your deploy failed before the release
   * creating step or you need to re-create the releases for some reason
   */
  gulp.task('deploy_create_releases', (done) => {
    // TODO: consider using async or similar to hide the anonymous tasks from gulp, see: https://github.com/gulpjs/gulp/issues/1143

    let tasks = [
      function (cb) {
        sake.options.owner = sake.config.deploy.dev.owner
        sake.options.repo = sake.config.deploy.dev.name
        sake.options.prefix_release_tag = sake.config.multiPluginRepo
        cb()
      },
      'github:create_release'
    ]

    return gulp.series(tasks)(done)
  })

  // main task for deploying the plugin after build to the production repo
  gulp.task('deploy_to_production_repo', (done) => {
    let tasks = []

    if (sake.config.deploy.type === 'wc') {
      tasks.push('deploy_to_wc_repo')
    } else if (sake.config.deploy.type === 'wp') {
      tasks.push('deploy_to_wp_repo')
    } else {
      log.warn(chalk.yellow('No deploy type set, skipping deploy to remote repo'))
      return done()
    }

    gulp.series(tasks)(done)
  })

  /** WooCommerce repo related tasks ****************************************/

  // deploy to WC repo
  gulp.task('deploy_to_wc_repo', (done) => {
    validateEnvVariables()

    gulp.series('copy_to_wc_repo', 'shell:git_push_wc_repo')(done)
  })

  /**
   * Copy to WC repo
   *
   * Helper task which copies files to WC repo (used by update_wc_repo)
   *
   * Builds the plugin, pulls chances from the WC repo, cleans the local WC
   * repo clone, and then copies built plugin to clone
   */
  gulp.task('copy_to_wc_repo', (done) => {
    validateEnvVariables()

    let tasks = [
      // copy files to build directory
      'build',
      // ensure WC repo is up to date
      'shell:git_pull_wc_repo',
      // clean the WC plugin dir
      'clean:wc_repo',
      // copy files from build to WC repo directory
      'copy:wc_repo'
    ]

    // no need to build when part of deploy process
    if (sake.options.deploy) {
      tasks.shift()
    }

    gulp.series(tasks)(done)
  })

  // TODO: do we need this anymore?
  /**
   * Update WC repo
   *
   * Builds and copies plugin to WC repo then pushes a general "Updating {plugin name}"
   * commit. This is not a very useful task as it was created many moons ago to allow
   * us to quickly fix issues with the deploy (such as extra files, etc). The
   * task remains for posterity
   */
  gulp.task('update_wc_repo', (done) => {
    validateEnvVariables()

    gulp.series('copy_to_wc_repo', 'shell:git_update_wc_repo')(done)
  })

  /** WP.org deploy related tasks ****************************************/

  gulp.task('deploy_to_wp_repo', (done) => {
    let tasks = ['copy_to_wp_repo', 'shell:svn_commit_trunk']

    sake.options = _.merge({
      deployTag: true,
      deployAssets: true
    }, sake.options)

    if (sake.options.deployTag) {
      tasks.push('copy:wp_tag')
      tasks.push('shell:svn_commit_tag')
    }

    if (sake.options.deployAssets) {
      tasks.push('clean:wp_assets')
      tasks.push('copy:wp_assets')
      tasks.push('shell:svn_commit_assets')
    }

    gulp.series(tasks)(done)
  })

  gulp.task('copy_to_wp_repo', (done) => {
    let tasks = [
      // copy files to build directory
      'build',
      // ensure WP repo is up to date
      'shell:svn_checkout',
      // clean the WC plugin dir
      'clean:wp_trunk',
      // copy files from build to WP repo directory
      'copy:wp_trunk'
    ]

    // no need to build when part of deploy process
    if (sake.options.deploy) {
      tasks.shift()
    }

    gulp.series(tasks)(done)
  })

  gulp.task('fetch_latest_wp_wc_versions', (done) => {
    log.info('Fetching latest WP and WC versions')

    let requests = []

    // only fetch the latest if a version is specified
    // this allows us to set to a version that isn't yet released
    if (!sake.options.tested_up_to_wp_version) {
      requests.push(
        axios.get('https://api.wordpress.org/core/version-check/1.7/')
          .then(res => {
            sake.options.tested_up_to_wp_version = res.data.offers[0].version
          })
      )
    }

    if (sake.config.platform === 'wc' && !sake.options.tested_up_to_wc_version) {
      requests.push(
        axios.get('https://api.wordpress.org/plugins/info/1.0/woocommerce.json')
          .then(res => {
            if (res.data.error) {
              throw res.data.error
            }

            sake.options.tested_up_to_wc_version = res.data.version
          })
      )
    }

    axios.all(requests)
      .then(() => done())
      .catch(err => sake.throwDeferredError('An error occurred when fetching latest WP / WC versions: ' + err.toString()))
  })
}
