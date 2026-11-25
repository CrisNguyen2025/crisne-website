import type { JSX } from 'react';

import {
  AutoLinkPlugin as LexicalAutoLinkPlugin,
} from '@lexical/react/LexicalAutoLinkPlugin';

const URL_REGEX =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&=]*)(?<![-.+():%])/;

const EMAIL_LOCAL_BOUNDARY = /[\s<>()[\]\\,;:@"]/;
const DOMAIN_LABEL_REGEX = /^[a-z0-9-]+$/i;
const TLD_REGEX = /^[a-z]{2,}$/i;

function findEmailStart(text: string, atIndex: number): number {
  let start = atIndex;
  while (start > 0 && !EMAIL_LOCAL_BOUNDARY.test(text[start - 1])) {
    start--;
  }
  while (start < atIndex && text[start] === '.') {
    start++;
  }
  return start;
}

function findEmailDomainEnd(text: string, domainStart: number): number {
  let end = domainStart;
  while (end < text.length && /[a-z0-9.-]/i.test(text[end])) {
    end++;
  }
  while (end > domainStart && text[end - 1] === '.') {
    end--;
  }
  const domain = text.slice(domainStart, end);
  const labels = domain.split('.');
  if (labels.length < 2) return -1;
  if (!TLD_REGEX.test(labels[labels.length - 1])) return -1;
  if (labels.some((label) => !DOMAIN_LABEL_REGEX.test(label))) return -1;
  return end;
}

function matchEmailInText(text: string) {
  let searchFrom = 0;
  while (searchFrom < text.length) {
    const atIndex = text.indexOf('@', searchFrom);
    if (atIndex === -1) return null;

    const start = findEmailStart(text, atIndex);
    const local = text.slice(start, atIndex);
    const domainEnd = findEmailDomainEnd(text, atIndex + 1);

    if (local && !local.endsWith('.') && domainEnd > atIndex + 1) {
      const matched = text.slice(start, domainEnd);
      return {
        index: start,
        length: matched.length,
        text: matched,
        url: `mailto:${matched}`,
      };
    }
    searchFrom = atIndex + 1;
  }
  return null;
}

const MATCHERS = [
  (text: string) => {
    const match = URL_REGEX.exec(text);
    if (!match) return null;
    return {
      index: match.index,
      length: match[0].length,
      text: match[0],
      url: match[0].startsWith('http') ? match[0] : `https://${match[0]}`,
      attributes: {
        target: '_blank',
        rel: 'noopener noreferrer',
      },
    };
  },
  matchEmailInText,
];

export function AutoLinkPlugin(): JSX.Element {
  return <LexicalAutoLinkPlugin matchers={MATCHERS} />;
}
