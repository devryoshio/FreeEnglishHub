import re

import eng_to_ipa as ipa
from nltk.corpus import wordnet


def clean_word(word: str) -> str:
    return word.strip(".,!?;:\"'()[]{}").lower()


async def lookup_word(word: str):
    clean = clean_word(word)

    if not clean:
        return None

    synsets = wordnet.synsets(clean)

    if not synsets:
        return None

    synset = synsets[0]

    pronunciation = ipa.convert(clean)

    if pronunciation == "*":
        pronunciation = None

    meaning = synset.definition()

    examples = synset.examples()
    example = examples[0] if examples else None

    part_of_speech = synset.pos()

    pos_map = {
        "n": "noun",
        "v": "verb",
        "a": "adjective",
        "s": "adjective",
        "r": "adverb",
    }

    part_of_speech = pos_map.get(
        part_of_speech,
        part_of_speech,
    )

    return {
        "word": clean,
        "ipa": pronunciation,
        "meaning": meaning,
        "example": example,
        "part_of_speech": part_of_speech,
    }