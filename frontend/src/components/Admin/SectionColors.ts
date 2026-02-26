/**
 * 13 paper background colors matching Paper{HEX}.jpg textures in public/images.
 * Each hex corresponds to /images/Paper{HEX}.jpg used for section info cards and jump-to buttons.
 */
export const SECTION_PAPER_HEXES = [
  '8492CC',
  '92CA9E',
  'A6C9D6',
  'BBF7B4',
  'C27775',
  'C9B289',
  'CABADD',
  'D6BB68',
  'DE986A',
  'EAC1A9',
  'EEE9DE',
  'F6D49C',
  'FCF8AA',
] as const;

export const SECTION_COLORS: string[] = SECTION_PAPER_HEXES.map((h) => `#${h}`);

export const MIN_SECTIONS = 3;
export const MAX_SECTIONS = 13;
