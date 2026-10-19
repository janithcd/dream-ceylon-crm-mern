import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";

export default [
    {
        files: ["src/**/*.{js,jsx}"],
        linterOptions: { reportUnusedDisableDirectives: "off" },
        languageOptions: {
            globals: globals.browser,
            parserOptions: { ecmaFeatures: { jsx: true } },
        },
        plugins: { "react-hooks": reactHooks },
        rules: { "no-undef": "error" },
    },
    {
        files: ["src/**/*.test.js"],
        languageOptions: { globals: globals.node },
    },
];
