/**
 * What the dig turns up: real lines from real ancient astrological texts.
 *
 * Every session standing in this world is an archaeologist, and when one is
 * WORKING it is out at a site — see world/src/app/digs.js for where those are.
 * What comes out of the ground is this: a line somebody actually wrote, that
 * Kevin can actually read, from a book he could go and check.
 *
 * NOTHING HERE IS WRITTEN BY ME. Not one line is paraphrased, modernised or
 * invented. Every one was taken from a scan of the book itself and then
 * CHECKED back against that scan, character for character — the check is the
 * point, because a plausible-sounding astrological aphorism is the easiest
 * thing in the world to produce and the hardest thing to catch once it is in
 * front of an astrologer as a genuine find.
 *
 * Two repairs only, both to the SCAN rather than the text: whitespace is
 * collapsed, and a word the printer broke across a line ("impres- sions") is
 * rejoined. Two further candidate lines were DROPPED rather than corrected
 * because their scan had real OCR damage ("apphed" for "applied") — fixing
 * that would have meant writing a word into Ptolemy's mouth on my own
 * judgement, which is exactly what this file exists not to do.
 *
 * CLEARANCE. Both sources are public domain in the US and both the original
 * and the English are clear, which is the rule docs/DELINEATION-SOURCES.md in
 * the Arcus repo sets for any quoted text. Ptolemy's own Greek is second
 * century; Ashmand's translation is 1822. Bonatti wrote in the thirteenth
 * century; Coley's English is 1676, reprinted 1886. Nothing here is from a
 * modern translation, and nothing modern may be added to this file without
 * checking that catalogue first.
 *
 * Scans used, both marked public domain by the holding library:
 *   archive.org/details/ptolemystetrabi00procgoog
 *   archive.org/details/b24884054
 */

export const SOURCES = {
  ptolemy: { title: 'Tetrabiblos', author: 'Ptolemy', said: 'Ptolemy, Tetrabiblos, tr. Ashmand 1822' },
  bonatti: { title: 'Anima Astrologiae', author: 'Guido Bonatti', said: 'Bonatti, Anima Astrologiae, tr. Coley 1676' },
};

/** Every line, as [source key, the line]. */
export const LINES = [
  ['ptolemy', 'Fire and air, the first of the sublunary elements, are encompassed and altered by the motions of the ether.'],
  ['ptolemy', 'By the changes of her illumination, rivers swell and are reduced.'],
  ['ptolemy', 'The tides of the sea are ruled by her risings and settings.'],
  ['ptolemy', 'They cause heats, winds, and storms, to the influence of which earthly things are conformably subjected.'],
  ['ptolemy', 'All which circumstances, when exactly defined and understood, certainly tend towards accurate foreknowledge.'],
  ['ptolemy', 'Because prognostications thus imperfectly derived are sometimes liable to be fallacious.'],
  ['ptolemy', 'The art of navigation, for instance, is not rejected, although it is in many points incomplete.'],
  ['ptolemy', 'And it remains to speak of the utility of the attainment.'],
  ['ptolemy', 'Knowledge may be acquired by Astronomy to a certain Extent.'],

  ['bonatti', 'Yet they all deserve to be known, and without them an Astrologer shall never be able to give true and perfect judgement.'],
  ['bonatti', 'But we may come near the truth, and differ from it only in some small time or circumstances.'],
  ['bonatti', 'When the Querent is so silly that he knows not how to ask, nor what he would have.'],
  ['bonatti', 'For then the Question is not Radical, as I have frequently found by experience.'],
  ['bonatti', 'All which we shall treat particularly, the same being a secret of secrets.'],
  ['bonatti', 'Which the ancients generally hold to be of ill signification.'],
  ['bonatti', 'When a Planet is Peregrine, that is, in a place where he hath not any Dignity.'],
  ['bonatti', 'Especially if thou hast always a diligent eye to the Moon.'],
  ['bonatti', 'For he believed That the Moon did bear what was committed to her.'],
  ['bonatti', 'Let him that has Mars in the second house beware of concerning himself in merchandise.'],
  ['bonatti', 'But he that hath Sagittarius or Pisces shall never lose his means, nor fall into poverty.'],
  ['bonatti', 'Whence thou mayest, wherever thou seest the Fortunes, hope for good.'],
  ['bonatti', 'For the Fortunes have power of imprinting good naturally, and the Infortunes as naturally shower down ill impressions.'],
  ['bonatti', 'But thou oughtest to consider in thy Judgments, not only what they did, but also all other circumstances that thou canst.'],
  ['bonatti', 'If it be in Cadent Houses, it will scarce ever be, though other significators seem never so favourable.'],
  ['bonatti', 'And if two at least of them be not so, take it for certain it will never be done.'],
  ['bonatti', 'At which time thou therefore oughtest not to receive any Question.'],
  ['bonatti', 'The Twelfth Consideration, Is to behold the Fortunes, and see what they signify.'],
  ['bonatti', 'The Fourteenth Consideration, is to mind Mercury and the Moon, and what Planets they are joined with.'],
];

/**
 * A line nobody has dug up yet, or null once the whole corpus is out of the
 * ground. Spent rather than rolled, because a dig that turns up the same
 * tablet twice is not a dig.
 */
export function unearth(alreadyFound, r) {
  const seen = new Set(alreadyFound || []);
  const left = LINES.filter(([, text]) => !seen.has(text));
  if (!left.length) return null;
  const [key, text] = left[Math.floor(r() * left.length) % left.length];
  return { text, source: SOURCES[key].said, author: SOURCES[key].author, work: SOURCES[key].title };
}

/** How much is still buried, for the panel to say so. */
export function corpusSize() { return LINES.length; }
