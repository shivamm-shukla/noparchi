import React from 'react';
import { Text as RNText, type TextProps as RNTextProps } from 'react-native';
import { useScript } from '../../src/context/LanguageContext';
// typography.js is CommonJS so that tailwind.config.js can read the same file.
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { familyFor } = require('../../src/config/typography.js') as {
  familyFor: (role: string, weight: string, script: string) => string;
};

/**
 * `role-weight`, matching the faces in src/config/typography.js.
 * `display` is Manrope, for headings and numbers; `body` is Inter, for
 * everything else.
 */
export type FontToken =
  | 'display-semibold'
  | 'display-bold'
  | 'display-extrabold'
  | 'body'
  | 'body-medium'
  | 'body-semibold'
  | 'body-bold';

export interface TextProps extends RNTextProps {
  font?: FontToken;
  className?: string;
}

/**
 * Devanagari is never letter-spaced.
 *
 * Tracking is a Latin device - it opens up an uppercase eyebrow and makes it
 * read as a label. Devanagari has no case and joins its characters, so the same
 * class prises apart a word that is meant to be continuous and makes matras
 * float away from the letters they belong to. The landing page zeroes tracking
 * for Hindi for exactly this reason.
 *
 * Stripped from the class string rather than overridden in `style`, because the
 * className-derived style is merged by nativewind downstream of this component
 * and would win.
 */
const TRACKING_CLASS = /(^|\s)tracking-[\w[\].-]+/g;

function forScript(className: string | undefined, script: string): string | undefined {
  if (!className || script !== 'devanagari') return className;
  return className.replace(TRACKING_CLASS, ' ').replace(/\s+/g, ' ').trim() || undefined;
}

/**
 * Every piece of text in the app goes through here.
 *
 * The reason it exists rather than a Tailwind `font-*` class: the face has to
 * change with the language. A Tailwind class compiles to one static family, and
 * while a web browser will fall back per glyph through a family stack, React
 * Native will not - it takes the first name and, finding no Devanagari in
 * Inter, hands Hindi to whatever the OS substitutes. Conjuncts and matras break
 * and it reads as broken to anyone who actually speaks the language.
 *
 * So the script is resolved at render, the face is set explicitly, and the
 * Latin-only typographic tricks are taken back off. Size, colour and spacing
 * stay in `className` where they belong.
 */
export const Text: React.FC<TextProps> = ({ font = 'body', style, className, ...props }) => {
  const script = useScript();
  const [role, weight = 'regular'] = font.split('-');

  return (
    <RNText
      {...props}
      className={forScript(className, script)}
      style={[{ fontFamily: familyFor(role, weight, script) }, style]}
    />
  );
};
