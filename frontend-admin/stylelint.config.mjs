import config from '@lobehub/stylelint-config';

export default {
  ...config,
  rules: {
    ...config.rules,
    'custom-property-empty-line-before': null,
    'hue-degree-notation': null,
    'import-notation': null,
    'lightness-notation': null,
  },
};
