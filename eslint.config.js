// ESLint finds bugs; Prettier owns formatting. js/recommended has no formatting
// rules, so the two never disagree and no eslint-config-prettier is needed.
const {defineConfig, globalIgnores} = require('eslint/config')
const js = require('@eslint/js')
const globals = require('globals')

module.exports = defineConfig([
	// Google's Maps loader, kept exactly as Google publishes it.
	globalIgnores(['public/js/gmapLoader.js']),
	{
		files: ['**/*.js'],
		plugins: {js},
		extends: ['js/recommended'],
		languageOptions: {sourceType: 'commonjs', globals: globals.node},
		rules: {
			// Not in js/recommended. Catches a name used above its definition, such
			// as a const read before its line runs. The repo had no such use when
			// this was switched on, so it guards new code and changes none.
			'no-use-before-define': 'error',
		},
	},
	{
		// Browser scripts, loaded with <script src>. Not modules, so their
		// top-level names are globals, and so are the libraries the views load
		// from CDNs before them: Google Maps and Mapbox GL.
		files: ['public/js/**/*.js'],
		languageOptions: {
			sourceType: 'script',
			globals: {
				...globals.browser,
				google: 'readonly',
				mapboxgl: 'readonly',
			},
		},
	},
])
