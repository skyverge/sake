const lazypipe = require('lazypipe')

module.exports = (config, plugins, options) => {
  const pipes = {}

  // replace minimum WP version
  pipes.minimum_wp_version = lazypipe()
    .pipe(plugins.replace, /('minimum_wp_version'[\s]*=>[\s]*)'([^']*)'/, "$1'" + options.minimum_wp_version + "'")
    .pipe(plugins.replace, /Requires at least: .*\n/, 'Requires at least: ' + options.minimum_wp_version + '\n')

  // replace tested up to WP version
  pipes.tested_up_to_wp_version = lazypipe()
    .pipe(plugins.replace, /Tested up to: .*\n/, 'Tested up to: ' + options.tested_up_to_wp_version + '\n')

  // replace minimum WC version
  pipes.minimum_wc_version = lazypipe()
    .pipe(plugins.replace, /('minimum_wc_version'[\s]*=>[\s]*)'([^']*)'/, "$1'" + options.minimum_wc_version + "'")
    .pipe(plugins.replace, /WC requires at least: .*\n/, 'WC requires at least: ' + options.minimum_wc_version + '\n')

  // replace tested up to WC version
  pipes.tested_up_to_wc_version = lazypipe()
    .pipe(plugins.replace, /WC tested up to: .*\n/, 'WC tested up to: ' + options.tested_up_to_wc_version + '\n')

  // TODO: add support for FW v5
  // replace FW version
  pipes.framework_version = lazypipe()
    .pipe(plugins.replace, /SV_WC_Framework_Bootstrap::instance\(\)->register_plugin\( '([^']*)'/, () => "SV_WC_Framework_Bootstrap::instance()->register_plugin( '" + options.framework_version + "'")

  // replace FW backwards comaptibility
  pipes.backwards_compatible = lazypipe()
    .pipe(plugins.replace, /('backwards_compatible'[\s]*=>[\s]*)'([^']*)'/, "$1'" + options.backwards_compatible + "'")

  return { replace: pipes }
}
