import solc from 'solc';
import { readFile, writeFile } from 'node:fs/promises';
import { keccak256 } from 'viem';
const root = new URL('../packages/local-driver/contracts/', import.meta.url);
const source = await readFile(new URL('LocalTestToken.sol', root), 'utf8');
const input = {
  language: 'Solidity',
  sources: { 'LocalTestToken.sol': { content: source } },
  settings: {
    optimizer: { enabled: true, runs: 200 },
    evmVersion: 'paris',
    outputSelection: {
      '*': { '*': ['abi', 'evm.bytecode.object', 'evm.deployedBytecode.object'] },
    },
  },
};
const output = JSON.parse(solc.compile(JSON.stringify(input)));
if (output.errors?.some((e) => e.severity === 'error'))
  throw new Error(JSON.stringify(output.errors));
const token = output.contracts['LocalTestToken.sol'].LocalTestToken;
const codeHash = keccak256('0x' + token.evm.deployedBytecode.object);
const files = new Map([
  [
    new URL('artifact.json', root),
    JSON.stringify(
      {
        compiler: solc.version(),
        abi: token.abi,
        bytecode: '0x' + token.evm.bytecode.object,
        codeHash,
      },
      null,
      2,
    ) + '\n',
  ],
  [
    new URL('../packages/contracts/known-deployments.json', import.meta.url),
    JSON.stringify({ localTestTokenCodeHash: codeHash }, null, 2) + '\n',
  ],
]);
for (const [file, contents] of files) {
  if (process.argv.includes('--check')) {
    if ((await readFile(file, 'utf8')) !== contents)
      throw new Error(`Contract artifact drift: ${file.pathname}`);
  } else await writeFile(file, contents);
}
