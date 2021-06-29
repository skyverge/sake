const _ = require('lodash')

module.exports = (gulp, plugins, sake) => {
  // main task for building the plugin:
  // - cleans the build directory
  // - compiles the plugin assets (linting where necessary)
  // - copies plugin files to the build directory
  let tasks = ['clean:build', 'shell:composer_status', 'clean:composer', 'shell:composer_install', 'compile', 'copy:build']

  if (sake.options['skip-composer']) {
    tasks = _.without(tasks, 'shell:composer_status', 'clean:composer', 'shell:composer_install')
  }

  gulp.task('build', gulp.series(tasks))
}
