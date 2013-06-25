module.exports = function(grunt) {

  "use strict"

  grunt.initConfig({
    pkg: grunt.file.readJSON('package.json'),
    banner: '/*! <%= pkg.title || pkg.name %> - v<%= pkg.version %> - ' +
      '<%= grunt.template.today("yyyy-mm-dd") %>\n' +
      '<%= pkg.homepage ? "* " + pkg.homepage + "\\n" : "" %>' +
      '* Copyright (c) <%= grunt.template.today("yyyy") %> <%= pkg.author.name %>;' +
      ' Licensed <%= _.pluck(pkg.licenses, "type").join(", ") %> */  \n',
    // Task configuration.
    jshint: {
      files: ['**/*.js*', '.jshintrc', '!node_modules/**/*.js*'],
      options: {
        jshintrc: '.jshintrc'
      }
    },
    /*
    watch: {
      files: ['<%= jshint.files %>', '**    /*.jade'],
      tasks: ['default']
    },
    */
    /*
    'mocha-hack': {
      options: {
        globals: ['should'],
        timeout: 3000,
        ignoreLeaks: false,
        ui: 'bdd',
        reporter: 'spec'
      },

      all: { src: 'test/**    /*.js' }
    }
    */
  });

  // These plugins provide necessary tasks.
  grunt.loadNpmTasks('grunt-contrib-jshint');
  // grunt.loadNpmTasks('grunt-contrib-watch');
  // grunt.loadNpmTasks('grunt-mocha-hack');

  // Default task.
  // grunt.registerTask('default', ['jshint', 'mocha-hack']);
  grunt.registerTask('default', ['jshint']);

  // Travis-CI task
  grunt.registerTask('travis', ['default']);
}