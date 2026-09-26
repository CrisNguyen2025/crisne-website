import type { JSX } from 'react';

import {
  AutoLinkPlugin as LexicalAutoLinkPlugin,
  createLinkMatcherWithRegExp,
} from '@lexical/react/LexicalAutoLinkPlugin';

const URL_REGEX =
  /((https?:\/\/(www\.)?)|(www\.))[-a-zA-Z0-9@:%._+~#=]{1,256}\.[a-zA-Z0-9()]{1,6}\b([-a-zA-Z0-9()@:%_+.~#?&//=]*)(?<![-.+():%])/;

const EMAIL_REGEX =
  /(([^<>()[\]\\.,;:\s@"]+(\.[^<>()[\]\\.,;:\s@"]+)*)|(".+"))@((\[[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\.[0-9]{1,3}\])|(([a-zA-Z\-0-9]+\.)+[a-zA-Z]{2,}))/; // NOSONAR: regex accepted for email auto-link

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
  createLinkMatcherWithRegExp(EMAIL_REGEX, text => {
    return `mailto:${text}`;
  }),
];

export function AutoLinkPlugin(): JSX.Element {
  return <LexicalAutoLinkPlugin matchers={MATCHERS} />;
}
