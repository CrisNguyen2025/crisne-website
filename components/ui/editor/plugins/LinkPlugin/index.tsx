import { LinkPlugin as LexicalLinkPlugin } from '@lexical/react/LexicalLinkPlugin';

import { validateUrl } from '../../utils/url';

type Props = {
  hasLinkAttributes?: boolean;
  skipValidateUrl?: boolean;
};

export default function LinkPlugin({ hasLinkAttributes = false, skipValidateUrl = false }: Props) {
  return (
    <LexicalLinkPlugin
      {...(skipValidateUrl ? { validateUrl } : {})}
      attributes={
        hasLinkAttributes
          ? {
              rel: 'noopener noreferrer',
              target: '_blank',
            }
          : undefined
      }
    />
  );
}
