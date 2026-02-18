# @scedel/parser

<img src="https://raw.githubusercontent.com/ScedelLang/grammar/5f1e7572f328d657c726a2fcaeaf53d9f6863d6a/logo.svg" width="250px" alt="logo" />

Pure JS Scedel parser for JS/TS projects.

## RFC support

- [Target RFC: `0.14.2`](https://github.com/ScedelLang/grammar/blob/main/RFC-Scedel-0.14.2.md)

## API

```js
import { ParserService } from '@scedel/parser';

const parser = new ParserService();
const ast = parser.parseString(source, 'inline.scedel');
```

## CLI

```bash
node js/scedel-parser/bin/parse-example.mjs
node js/scedel-parser/bin/parse-example.mjs /absolute/path/schema.scedel
```
