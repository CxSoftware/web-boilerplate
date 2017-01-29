// Gulp
const gulp = require ('gulp');

// Other modules
const AWS = require ('aws-sdk');
const awspublish = require ('gulp-awspublish');
const browserSync = require ('browser-sync').create ();
const Bust = require ('gulp-bust');
const clean = require ('gulp-rimraf');
const cloudfront = require ('gulp-cloudfront-invalidate-aws-publish');
const globby = require ('globby');
const htmlmin = require ('gulp-htmlmin');
const mustache = require ('gulp-mustache');
const path = require ('path');
const runSequence = require ('run-sequence');
const webpackStream = require ('webpack-stream');
const webpack = require ('webpack');

// Constants
const AWS_PROFILE = null;
const AWS_REGION = null;
const AWS_BUCKET = null;
const AWS_DISTRIBUTION = null;

// Check
if (!AWS_PROFILE)
	throw Error ('Configure constants in gulpfile.js!');

// Globals
const bust = new Bust ();

// Load AWS credentials
const awsCredentials = new AWS.SharedIniFileCredentials ({
	profile: AWS_PROFILE});

// Config (default: dev)
const config = {
	// Options
	minimizeHtml: false,
	minimizeCss: false,

	// Modules
	webpack: {
		module: {
			loaders: [
				{
					test: /\.js$/,
					exclude: /(node_modules|bower_components)/,
					loader: 'babel-loader',
					query: {
						presets: ['es2015', 'stage-3'],
						plugins: ['transform-runtime']
					}
				},
				{
					test: /\.vue$/,
					loader: 'vue-loader'
				}
			]
		}
	},
	mustache: () => {
		return  {
			scripts: globby.sync (
				['*.js'],
				{ cwd: path.join (__dirname, 'dist') })
		}
	},
	htmlmin: {
		collapseWhitespace: true,
		removeComments: true
	},
	publisher: {
		aws: {
			region: AWS_REGION,
			params: {
				Bucket: AWS_BUCKET
			},
			credentials: awsCredentials
		},
		custom: {
			cacheFileName: 'publish.cache'
		},
		headers: {
			'Cache-Control': 'max-age=315360000, no-transform, public'
		}
	},
	cloudfront: {
		distribution: AWS_DISTRIBUTION,
		indexRootPath: true,
		credentials: awsCredentials
	}
};

// Unit tasks
gulp.task ('clean', () => gulp
	.src ('dist/**/*', { read: false })
	.pipe (clean ()));

gulp.task ('webpack', () => gulp
	.src ('src/js/index.js')
	.pipe (webpackStream (config.webpack))
	.pipe (gulp.dest ('dist')));

gulp.task ('html', () =>
{
	const step1 = gulp
		.src ('src/index.html')
		.pipe (mustache (config.mustache ()));

	const step2 = config.minimizeHtml ?
		step1.pipe (htmlmin (config.htmlmin)) :
		step1;
	
	console.log (config.minimizeCss);
	const step3 = config.minimizeCss ?
		step2.pipe (bust.references ()) :
		step2;

	return step3.pipe (gulp.dest ('dist'));
});

gulp.task ('css', () =>
{
	const step1 = gulp.src ('src/**/*.css');
	const step2 = config.minimizeCss ?
		step1.pipe (bust.resources ()) :
		step1;

	return step2.pipe (gulp.dest ('dist'));
});

// Meta tasks
gulp.task ('prod', done =>
{
	config.miminizeHtml = true;
	config.minimizeCss = true;
	config.webpack.plugins = [ new webpack.optimize.UglifyJsPlugin (
			{ output: { comments: false } }) ];

	runSequence (
		'clean',
		'webpack',
		'css',
		'html',
		done);
});

const publish = force =>
{
	const publisher = awspublish.create (
		config.publisher.aws,
		config.publisher.custom);

	return gulp
		.src ('./dist/**/*')
		.pipe (publisher.publish (
			config.publisher.headers,
			{ force: force }))
		.pipe (cloudfront (config.cloudfront))
		.pipe (publisher.cache ())
		.pipe (awspublish.reporter ());
};
gulp.task ('publish', ['prod'], () => publish (false));
gulp.task ('force-publish', ['prod'], () => publish (true));

gulp.task ('dev', done =>
{
	runSequence (
		'clean',
		'webpack',
		'css',
		'html',
		done);
});

// Browser sync and watch
gulp.task ('dev-and-reload', ['dev'], done =>
{
	browserSync.reload ();
	done ();
});

// Default task
gulp.task ('default', ['dev'], () =>
{
	browserSync.init ({
		server: {
			baseDir: "./dist/"
		}
	});
	gulp.watch ("src/**/*", ['dev-and-reload']);
});
