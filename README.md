# @scedel/parser

Pure JS SCEDel parser for JS/TS projects.

## RFC support

- Target RFC: `0.14.2`

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
