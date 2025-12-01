import { readFileSync } from 'fs';
const wasmBuffer = readFileSync('plugin.wasm');
const wasmModule = new WebAssembly.Module(wasmBuffer);

const imports = WebAssembly.Module.imports(wasmModule);
const exports = WebAssembly.Module.exports(wasmModule);

console.log('\n=== WASM IMPORTS ===');
imports.forEach(imp => {
  console.log(`${imp.module}.${imp.name} (${imp.kind})`);
});

console.log('\n=== WASM EXPORTS ===');
exports.forEach(exp => {
  console.log(`${exp.name} (${exp.kind})`);
});

console.log('\n=== Looking for sk_exec_command ===');
const hasExecCommand = imports.some(imp => imp.name === 'sk_exec_command');
console.log(`sk_exec_command found: ${hasExecCommand}`);

if (hasExecCommand) {
  const execCmd = imports.find(imp => imp.name === 'sk_exec_command');
  console.log(`Module: ${execCmd.module}, Kind: ${execCmd.kind}`);
}
