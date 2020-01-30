const path = require('path')
const ExtractTextPlugin = require('extract-text-webpack-plugin')

const BrotliPlugin = require('brotli-webpack-plugin')

const isProduction = process.env.NODE_ENV === 'production'

const extractSass = new ExtractTextPlugin({
  filename: '[name].css',
})
const config = {
  mode: process.env.NODE_ENV,
  entry: {
    crowi: './resource/css/crowi.scss',
    'crowi-reveal': './resource/css/crowi-reveal.scss',
  },
  output: {
    path: path.join(__dirname, '/../public/css'),
    filename: '[name].css',
  },
  devtool: 'source-map',
  module: {
    rules: [
      {
        test: /\.scss$/,
        use: extractSass.extract({
          use: [
            {
              loader: 'css-loader',
              options: {
                url: false,
                minimize: isProduction,
              },
            },
            {
              loader: 'sass-loader',
              options: {
                includePaths: [
                  './node_modules/bootstrap-sass/assets/stylesheets',
                  './node_modules/@fortawesome/fontawesome-free-webfonts/scss',
                  './node_modules/reveal.js/css',
                ],
              },
            },
          ],
          fallback: 'style-loader',
        }),
      },
      {
        test: /\.woff2?$|\.ttf$|\.eot$|\.svg$/,
        use: [
          {
            loader: 'file-loader',
          },
        ],
      },
    ],
  },
  plugins: [
    extractSass,
    // new ExtractTextPlugin(
    //  './node_modules/highlight.js/styles/tomorrow-night.css'
    // ),
    // new ExtractTextPlugin([
    //  './node_modules/highlight.js/styles/tomorrow-night.css',
    //  './node_modules/diff2html/dist/diff2html.css',
    // ]),
    new BrotliPlugin({
      test: /\.(?:css|svg)(\?.*)?$/i,
      minRatio: 0.9,
    }),
  ],
}

module.exports = config
