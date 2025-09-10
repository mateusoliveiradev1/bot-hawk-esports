module.exports = {
  presets: [
    ['@babel/preset-env', { targets: { node: 'current' } }],
    '@babel/preset-typescript'
  ],
  plugins: [
    [
      'module-resolver',
      {
        root: ['./src'],
        alias: {
          '@': './src',
          '@commands': './src/commands',
          '@events': './src/events',
          '@services': './src/services',
          '@utils': './src/utils',
          '@types': './src/types',
          '@database': './src/database',
          '@middleware': './src/middleware'
        }
      }
    ]
  ]
};