import esbuild from "esbuild";
import JavaScriptObfuscator from "javascript-obfuscator";
import { writeFileSync } from "fs";

console.log("Bundling server.ts ...");

const result = await esbuild.build({
  entryPoints: ["server.ts"],
  bundle: true,
  format: "esm",
  minify: true,
  sourcemap: false,
  write: false
});

const bundled = result.outputFiles[0].text;

console.log("Obfuscating...");

const obfuscated = JavaScriptObfuscator.obfuscate(bundled, {
  compact: true,
  controlFlowFlattening: false,       // keep build quick
  stringArray: true,
  renameGlobals: true,
  identifierNamesGenerator: "hexadecimal"
}).getObfuscatedCode();

writeFileSync("server.obf.js", obfuscated);
console.log("Generated server.obf.js");
