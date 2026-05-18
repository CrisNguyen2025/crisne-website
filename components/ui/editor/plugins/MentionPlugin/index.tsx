import type { JSX } from 'react';

import { useLexicalComposerContext } from '@lexical/react/LexicalComposerContext';
import {
  LexicalTypeaheadMenuPlugin,
  MenuOption,
  MenuTextMatch,
  useBasicTypeaheadTriggerMatch,
} from '@lexical/react/LexicalTypeaheadMenuPlugin';
import { TextNode } from 'lexical';
import { useEffect, useMemo, useRef, useState } from 'react';
import * as ReactDOM from 'react-dom';

import { cn } from '@/lib/utils';
import { $createMentionNode } from '../../nodes/MentionNode';

const TRIGGERS = ['{{', '@'].join('|');

const VALID_CHARS = 'a-zA-Z0-9_';
const VALID_JOINS = '\\.-';
const LENGTH_LIMIT = '50';

const MENTION_REGEX = new RegExp(
  '(^|\\s|\\()(' + '(?:' + TRIGGERS + ')' + '([' + VALID_CHARS + VALID_JOINS + ']{0,' + LENGTH_LIMIT + '})' + ')$',
);

const SUGGESTION_LIST_LENGTH_LIMIT = 5;

class LookupService {
  private data: string[];

  constructor() {
    this.data = [];
  }

  public init(data: string[]) {
    this.data = data;
  }

  public search(value: string | null, callback: (results: Array<string>) => void): void {
    if (!value) {
      callback(this.data.slice(0, SUGGESTION_LIST_LENGTH_LIMIT));
      return;
    }

    const normalizedValue = value.toLowerCase();
    const results = this.data
      .filter(item => item.toLowerCase().includes(normalizedValue))
      .slice(0, SUGGESTION_LIST_LENGTH_LIMIT);

    callback(results);
  }
}

const useMentionLookupService = ({ mentionString, data }: { mentionString: string | null; data: string[] }) => {
  const [results, setResults] = useState<Array<string>>([]);
  const lookupRef = useRef<LookupService>(new LookupService());

  useEffect(() => {
    if (data?.length > 0) {
      lookupRef.current.init(data);
    }
  }, [data]);

  useEffect(() => {
    lookupRef.current.search(mentionString, newResults => {
      setResults(newResults);
    });
  }, [mentionString]);

  return results;
};

function checkForAtSignMentions(text: string, minMatchLength: number): MenuTextMatch | null {
  // const index = text.lastIndexOf('{{.');
  const match = MENTION_REGEX.exec(text);

  if (!match) return null;

  // const matchingString = text.slice(index + 1);
  const maybeLeadingWhitespace = match[1];

  const matchingString = match[2];

  if (matchingString.length < minMatchLength) return null;

  return {
    leadOffset: match.index + maybeLeadingWhitespace.length,
    matchingString,
    replaceableString: matchingString,
  };
}

function getPossibleQueryMatch(text: string): MenuTextMatch | null {
  return checkForAtSignMentions(text, 1);
}

class MentionTypeaheadOption extends MenuOption {
  name: string;
  value?: string;
  picture?: JSX.Element;

  constructor(name: string, picture?: JSX.Element) {
    super(name);
    this.name = name;
    this.picture = picture;
  }
}

function MentionsTypeaheadMenuItem({
  index,
  isSelected,
  onClick,
  onMouseEnter,
  option,
}: {
  index: number;
  isSelected: boolean;
  onClick: () => void;
  onMouseEnter: () => void;
  option: MentionTypeaheadOption;
}) {
  return (
    <li
      key={option?.key}
      tabIndex={-1}
      className={cn(
        'body-sm flex min-w-44 cursor-pointer p-2 first:rounded-t-lg last:rounded-b-lg',
        isSelected && 'bg-page',
      )}
      ref={option?.setRefElement}
      role='option'
      aria-selected={isSelected}
      id={'typeahead-item-' + index}
      onMouseEnter={onMouseEnter}
      onClick={onClick}
    >
      <span className='line-clamp-1'>{option.name}</span>
    </li>
  );
}

export default function NewMentionsPlugin({ data }: { data: string[] }): JSX.Element | null {
  const [editor] = useLexicalComposerContext();

  const [queryString, setQueryString] = useState<string | null>(null);

  const results = useMentionLookupService({ mentionString: queryString, data });

  const checkForSlashTriggerMatch = useBasicTypeaheadTriggerMatch('/', {
    minLength: 0,
  });

  const options = useMemo(
    () => results.map(result => new MentionTypeaheadOption(result)).slice(0, SUGGESTION_LIST_LENGTH_LIMIT),
    [results],
  );

  const onSelectOption = (
    selectedOption: MentionTypeaheadOption,
    nodeToReplace: TextNode | null,
    closeMenu: () => void,
  ) => {
    editor.update(() => {
      const mentionNode = $createMentionNode(selectedOption.name);
      if (nodeToReplace) {
        nodeToReplace.replace(mentionNode);
      }
      mentionNode.select();
      closeMenu();
    });
  };

  const checkForMentionMatch = (text: string) => {
    const slashMatch = checkForSlashTriggerMatch(text, editor);
    if (slashMatch !== null) {
      return null;
    }
    return getPossibleQueryMatch(text);
  };

  return (
    <LexicalTypeaheadMenuPlugin<MentionTypeaheadOption>
      onQueryChange={setQueryString}
      onSelectOption={onSelectOption}
      triggerFn={checkForMentionMatch}
      options={options}
      menuRenderFn={(anchorElementRef, { selectedIndex, selectOptionAndCleanUp, setHighlightedIndex }) =>
        anchorElementRef.current && results.length
          ? ReactDOM.createPortal(
              <div className='relative w-64 rounded-lg bg-card shadow-lg'>
                <ul className='max-h-52 list-none'>
                  {options.map((option, i: number) => (
                    <MentionsTypeaheadMenuItem
                      index={i}
                      isSelected={selectedIndex === i}
                      onClick={() => {
                        setHighlightedIndex(i);
                        selectOptionAndCleanUp(option);
                      }}
                      onMouseEnter={() => {
                        setHighlightedIndex(i);
                      }}
                      key={option.key}
                      option={option}
                    />
                  ))}
                </ul>
              </div>,
              anchorElementRef.current,
            )
          : null
      }
    />
  );
}
