import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: ['openapi.json', 'node_modules/**', 'dist/**']
  },
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/consistent-type-imports': ['error', { prefer: 'type-imports' }],
      '@typescript-eslint/no-explicit-any': 'off'
    }
  }
)
