import { expect, test } from 'vitest';
import { renderWithWeakPromises } from '../src/lib/utils-server/weak-promise-stream.js';
import { createWeakPromise } from '../src/lib/utils-server/weak-promise.js';

const encoder = new TextEncoder();

test('weak publication waits for an ordinary record boundary', async () => {
  const weak = createWeakPromise();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let marker: unknown;
  const output = renderWithWeakPromises({ INTENT: weak.promise }, (model) => {
    marker = model.INTENT;
    return new ReadableStream({
      start(controller) {
        source = controller;
      },
    });
  });
  const text = new Response(output).text();
  const prefix = 'x'.repeat(256);
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await marker) + '\n0:{"text":"' + prefix,
    ),
  );
  await new Promise<void>((resolve) => setImmediate(resolve));
  weak.resolve('intent');
  source.enqueue(encoder.encode('tail"}\n'));
  source.close();
  const actual = await text;
  const ordinary = '0:{"text":"' + prefix + 'tail"}\n';
  expect(actual).toContain(ordinary);
  expect(actual.indexOf('1:"intent"\n')).toBeGreaterThanOrEqual(
    ordinary.length,
  );
});

test('embedded binary newlines cannot become weak publication boundaries', async () => {
  const weak = createWeakPromise();
  let source!: ReadableStreamDefaultController<Uint8Array>;
  let marker: unknown;
  const output = renderWithWeakPromises({ INTENT: weak.promise }, (model) => {
    marker = model.INTENT;
    return new ReadableStream({
      start(controller) {
        source = controller;
      },
    });
  });
  const payload = 'first\nsecond\n';
  const header = '2:o' + payload.length.toString(16) + ',';
  source.enqueue(
    encoder.encode(
      '1:' + JSON.stringify(await marker) + '\n' + header + 'first\n',
    ),
  );
  const reader = output.getReader();
  const first = await reader.read();
  const parts = [first.value!];
  weak.resolve('intent');
  source.enqueue(encoder.encode('second\n0:{"data":"$2","INTENT":"$@1"}\n'));
  source.close();
  while (true) {
    const part = await reader.read();
    if (part.done) {
      break;
    }
    parts.push(part.value);
  }
  const actual = await new Response(
    new Blob(parts.map((part) => new Uint8Array(part))),
  ).text();
  expect(actual).toContain(header + payload);
  expect(actual.indexOf('1:"intent"\n')).toBeGreaterThanOrEqual(
    header.length + payload.length,
  );
});
