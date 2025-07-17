export default [
  {
    files: ["src/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        window: "readonly",
        document: "readonly",
        console: "readonly",
        navigator: "readonly",
        loadPyodide: "readonly",
        pako: "readonly",
        fetch: "readonly",
        TextDecoder: "readonly",
        TextEncoder: "readonly",
        Uint8Array: "readonly",
        handleFlash: "writable"
      }
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "error",
      "no-redeclare": "error"
    }
  }
];