// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require('eslint/config');
const expoConfig = require('eslint-config-expo/flat');
const prettierConfig = require('eslint-config-prettier/flat');

module.exports = defineConfig([
  expoConfig,
  prettierConfig,
  {
    // Edge Functions run on Deno and are checked by the Supabase CLI.
    ignores: ['dist/*', 'supabase/functions/*'],
  },
]);
