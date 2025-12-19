const path = require('path');
const webpack = require('webpack');
const CopyPlugin = require('copy-webpack-plugin');

// Load .env file for local development
require('dotenv').config();

module.exports = {
  mode: process.env.NODE_ENV || 'development',
  entry: {
    'background/service-worker': './src/background/service-worker.ts',
    'content/pr-detector': './src/content/pr-detector.ts',
    'popup/popup': './src/popup/popup.ts',
  },
  output: {
    path: path.resolve(__dirname, 'dist'),
    filename: '[name].js',
    clean: true,
  },
  module: {
    rules: [
      {
        test: /\.ts$/,
        use: 'ts-loader',
        exclude: /node_modules/,
      },
    ],
  },
  resolve: {
    extensions: ['.ts', '.js'],
    alias: {
      '@worktime/shared': path.resolve(__dirname, '../shared/src'),
    },
  },
  plugins: [
    new webpack.DefinePlugin({
      'process.env.GITHUB_CLIENT_ID': JSON.stringify(process.env.GITHUB_CLIENT_ID || ''),
      'process.env.API_BASE_URL': JSON.stringify(process.env.API_BASE_URL || 'http://localhost:8787'),
    }),
    new CopyPlugin({
      patterns: [
        { from: 'src/manifest.json', to: 'manifest.json' },
        { from: 'src/popup/popup.html', to: 'popup/popup.html' },
        { from: 'src/popup/popup.css', to: 'popup/popup.css' },
        { from: 'src/icons', to: 'icons' },
      ],
    }),
  ],
  devtool: 'source-map',
  optimization: {
    minimize: process.env.NODE_ENV === 'production',
  },
};
