// Deduplicate route metadata in the SSR head so that the most specific
// declaration wins. Layouts are emitted before the page they wrap, and a page
// before the slices it renders, so the last declaration of a key is the
// innermost one.
//
// Only keys whose consumers honour the *first* occurrence are handled. React
// re-adds any tag it rendered but did not find in the SSR html, appending it
// after the surviving one, so deduplicating a key that is resolved by its last
// occurrence (`viewport`) would invert it once hydration runs.

const HEAD_END = '</head>';

// React escapes `<`, `>`, `&` and `"` in both text and attribute values, so a
// tag always ends at the first `>` and title text at the first `<`.
const TAG_RE = /<title>[^<]*<\/title>|<meta\b[^>]*>/g;

const ATTR_RE = (attr: string) => new RegExp(`\\b${attr}="([^"]*)"`);

const NAME_RE = ATTR_RE('name');
const PROPERTY_RE = ATTR_RE('property');

const metadataKey = (tag: string): string | undefined => {
  if (tag.startsWith('<title')) {
    return 'title';
  }
  const name = NAME_RE.exec(tag)?.[1];
  if (name === 'description') {
    return 'name:description';
  }
  const property = PROPERTY_RE.exec(tag)?.[1];
  if (property?.startsWith('og:')) {
    return 'property:' + property;
  }
  return undefined;
};

export const dedupeHtmlMetadata = (head: string): string => {
  const tags: { key: string; start: number; end: number }[] = [];
  for (const match of head.matchAll(TAG_RE)) {
    const key = metadataKey(match[0]);
    if (key !== undefined) {
      tags.push({
        key,
        start: match.index,
        end: match.index + match[0].length,
      });
    }
  }
  const survivorByKey = new Map<string, number>();
  for (const tag of tags) {
    survivorByKey.set(tag.key, tag.start);
  }
  if (survivorByKey.size === tags.length) {
    return head;
  }
  let result = '';
  let cursor = 0;
  for (const tag of tags) {
    if (survivorByKey.get(tag.key) === tag.start) {
      continue;
    }
    result += head.slice(cursor, tag.start);
    cursor = tag.end;
  }
  return result + head.slice(cursor);
};

// Give up rather than hold a whole response: the error shell renders no
// `<head>` at all, and a document that has not closed one by this point is not
// one we can rewrite.
const MAX_BUFFERED_HEAD = 1024 * 1024;

const indexOfSubsequence = (
  haystack: Uint8Array,
  needle: Uint8Array,
  from: number,
): number => {
  outer: for (
    let i = Math.max(from, 0);
    i <= haystack.length - needle.length;
    i++
  ) {
    for (let j = 0; j < needle.length; j++) {
      if (haystack[i + j] !== needle[j]) {
        continue outer;
      }
    }
    return i;
  }
  return -1;
};

export const dedupeHtmlMetadataStream = (): TransformStream<
  Uint8Array,
  Uint8Array
> => {
  const encoder = new TextEncoder();
  const decoder = new TextDecoder();
  const headEnd = encoder.encode(HEAD_END);
  let buffered: Uint8Array[] | undefined = [];
  let bufferedLength = 0;

  const concat = (chunks: readonly Uint8Array[]): Uint8Array => {
    if (chunks.length === 1) {
      return chunks[0]!;
    }
    const out = new Uint8Array(bufferedLength);
    let offset = 0;
    for (const chunk of chunks) {
      out.set(chunk, offset);
      offset += chunk.byteLength;
    }
    return out;
  };

  const passThrough = (
    controller: TransformStreamDefaultController<Uint8Array>,
  ): void => {
    if (buffered?.length) {
      controller.enqueue(concat(buffered));
    }
    buffered = undefined;
  };

  return new TransformStream({
    transform(chunk, controller) {
      if (!buffered) {
        controller.enqueue(chunk);
        return;
      }
      // `</head>` may straddle chunks, so rescan from just before the tail.
      const searchFrom = bufferedLength - headEnd.length + 1;
      buffered.push(chunk);
      bufferedLength += chunk.byteLength;
      const all = concat(buffered);
      const found = indexOfSubsequence(all, headEnd, searchFrom);
      if (found === -1) {
        if (bufferedLength > MAX_BUFFERED_HEAD) {
          passThrough(controller);
        } else {
          buffered = [all];
        }
        return;
      }
      const split = found + headEnd.length;
      buffered = undefined;
      controller.enqueue(
        encoder.encode(
          dedupeHtmlMetadata(decoder.decode(all.subarray(0, split))),
        ),
      );
      if (split < all.length) {
        controller.enqueue(all.subarray(split));
      }
    },
    flush(controller) {
      passThrough(controller);
    },
  });
};
