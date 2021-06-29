const path = require('path')

module.exports = (gulp, plugins, sake) => {
  let defaultOptions = { read: false, allowEmpty: true }

  // clean dev dir from map files
  gulp.task('clean:dev', () => {
    return gulp.src(`${sake.config.paths.src}/${sake.config.paths.assets}/**/*.map`, defaultOptions).pipe(plugins.clean())
  })

  // clean composer packages
  gulp.task('clean:composer', () => {
    return gulp.src(`${sake.config.paths.vendor}`, defaultOptions).pipe(plugins.clean())
  })

  // clean (empty) build dir
  gulp.task('clean:build', () => {
    return gulp.src([
      `${sake.config.paths.build}/${sake.config.plugin.id}`,
      `${sake.config.paths.build}/${sake.config.plugin.id}.*.zip`
    ], defaultOptions).pipe(plugins.clean({ force: true }))
  })

  // clean WooCommerce repo dir
  gulp.task('clean:wc_repo', () => {
    // this will automatically exclude any dotfiles, such as the .git directory
    return gulp.src(sake.getProductionRepoPath() + '**/*', defaultOptions).pipe(plugins.clean({ force: true }))
  })

  // delete prerelease
  gulp.task('clean:prerelease', () => {
    return gulp.src([
      sake.getPrereleasesPath() + sake.config.plugin.id + '*.zip',
      sake.getPrereleasesPath() + sake.config.plugin.id + '*.txt'
    ], defaultOptions).pipe(plugins.clean({ force: true }))
  })

  // clear wp repo trunk
  gulp.task('clean:wp_trunk', () => {
    return gulp.src(path.join(sake.getProductionRepoPath(), 'trunk'), defaultOptions).pipe(plugins.clean({ force: true }))
  })

  // clear wp repo trunk
  gulp.task('clean:wp_assets', () => {
    return gulp.src(path.join(sake.getProductionRepoPath(), 'assets'), defaultOptions).pipe(plugins.clean({ force: true }))
  })
}
