#!/usr/bin/env node
/**
 * Build a standalone HTML file from the monolith JSX.
 * This is for sharing/demo — compiles everything into one file
 * that runs in Claude artifacts or any browser.
 * 
 * Usage: node scripts/build-standalone.js
 * Input:  src/grant-engine.monolith.jsx (the original single-file version)
 * Output: dist/grant-engine.html
 */
import { build } from "esbuild";
import { readFileSync, writeFileSync, mkdirSync } from "fs";

const MONOLITH = "src/grant-engine.monolith.jsx";

async function main() {
  mkdirSync("dist", { recursive: true });
  
  const result = await build({
    entryPoints: [MONOLITH],
    bundle: true,
    format: "esm",
    jsx: "automatic",
    write: false,
    external: ["react", "react-dom", "react/jsx-runtime"],
    minify: false,
  });

  const js = result.outputFiles[0].text;

  const html = `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>d-lab Grant Engine</title>
<style>*{margin:0;padding:0;box-sizing:border-box}html,body,#root{height:100%}</style>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react/18.2.0/umd/react.production.min.js"><\/script>
<script src="https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.2.0/umd/react-dom.production.min.js"><\/script>
</head><body><div id="root"></div><script type="module">
const{useState,useEffect,useCallback,useMemo,useRef}=React;
const{createRoot}=ReactDOM;
const jsxRuntime={jsx:React.createElement,jsxs:React.createElement,Fragment:React.Fragment};
${js.replace(/from\s+"react\/jsx-runtime"/g, 'from "data:text/javascript,"').replace(/from\s+"react"/g, 'from "data:text/javascript,"').replace(/from\s+"react-dom"/g, 'from "data:text/javascript,"')}
createRoot(document.getElementById("root")).render(React.createElement(App.default||App));
<\/script></body></html>`;

  writeFileSync("dist/grant-engine.html", html);
  console.log(`Built: dist/grant-engine.html (${(html.length / 1024).toFixed(0)}KB)`);
}

main().catch(console.error);
