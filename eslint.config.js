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
	},
	{
		// Browser scripts, loaded with <script src>. Not modules, so their
		// top-level names are globals, and so are the libraries the views load
		// from CDNs before them: Google Maps, Mapbox GL and jQuery.
		files: ['public/js/**/*.js'],
		languageOptions: {
			sourceType: 'script',
			globals: {
				...globals.browser,
				google: 'readonly',
				mapboxgl: 'readonly',
				$: 'readonly',
			},
		},
	},
])
