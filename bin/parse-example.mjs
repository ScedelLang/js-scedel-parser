#!/usr/bin/env node
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { ParseError, ParserService } from '../src/index.js';

const currentDir = path.dirname(fileURLToPath(import.meta.url));
const defaultExample = path.resolve(currentDir, '../../..', 'example.scedel');
const schemaPath = process.argv[2] ? path.resolve(process.argv[2]) : defaultExample;

const parser = new ParserService();

try {
  const ast = parser.parseFile(schemaPath);

  const typeDeclarations = ast.statements.filter((statement) => statement.kind === 'typeDeclaration');
  const validatorDeclarations = ast.statements.filter((statement) => statement.kind === 'validatorDeclaration');

  console.log(`Includes: ${ast.includes.length}`);
  console.log(`Statements: ${ast.statements.length}`);
  console.log(`Type declarations: ${typeDeclarations.length}`);
  console.log(`Validator declarations: ${validatorDeclarations.length}`);

  if (typeDeclarations.length > 0) {
    console.log('Types:');
    for (const declaration of typeDeclarations) {
      console.log(`  - ${declaration.name}`);
    }
  }

  if (validatorDeclarations.length > 0) {
    console.log('Validators:');
    for (const declaration of validatorDeclarations) {
      console.log(`  - ${declaration.targetType}(${declaration.name})`);
    }
  }
} catch (error) {
  if (error instanceof ParseError) {
    const location = error.line !== null && error.column !== null
      ? ` at ${error.line}:${error.column}`
      : '';

    console.error(`Parse error in ${error.sourceName ?? schemaPath}${location}: ${error.message}`);
    process.exitCode = 1;
  } else {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
