/** @type {import('@commitlint/types').UserConfig} */

const FORBIDDEN_SCOPES = ['admin', 'ops', 'infra', 'internal', 'dev', 'test'];

const PUBLIC_SCOPES = [
  'auth',
  'budget',
  'transactions',
  'shopping-list',
  'household',
  'goals',
  'reports',
  'dashboard',
  'notifications',
  'billing',
  'onboarding',
  'mobile',
  'ui',
  'api',
];

module.exports = {
  extends: ['@commitlint/config-conventional'],
  plugins: [
    {
      rules: {
        'paydrift-public-scope': (parsed) => {
          const { type, scope } = parsed;
          if (!['feat', 'fix'].includes(type)) {
            return [true];
          }
          if (!scope) {
            return [true];
          }
          if (PUBLIC_SCOPES.includes(scope)) {
            return [true];
          }
          return [
            false,
            `feat/fix scope "${scope}" must be a PayDrift public scope (${PUBLIC_SCOPES.join(', ')}) ` +
              'or use an internal type (chore, ci, build, etc.) without a public scope.',
          ];
        },
      },
    },
  ],
  rules: {
    'type-enum': [
      2,
      'always',
      ['feat', 'fix', 'docs', 'style', 'refactor', 'perf', 'test', 'build', 'ci', 'chore', 'revert'],
    ],
    'scope-enum': [2, 'never', FORBIDDEN_SCOPES],
    'paydrift-public-scope': [2, 'always'],
    'header-max-length': [2, 'always', 100],
    'subject-empty': [2, 'never'],
    'subject-case': [2, 'never', ['start-case', 'pascal-case', 'upper-case']],
  },
};
