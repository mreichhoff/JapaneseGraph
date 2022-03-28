import json
from heapq import heappush, heappushpop
from fugashi import Tagger
import argparse
from functools import reduce
tagger = Tagger('-Owakati')


def get_word_frequencies(filename):
    with open(filename) as f:
        return {value.strip(): idx for idx, value in enumerate(f)}


def get_word_set(filename):
    with open(filename) as f:
        return {value.strip(): [] for value in f}


punctuation = {'。', '‘', '’', '“', '”',
               '，', '？', '、', '。', '）', '（', '」', '「'}


def get_average_frequency(word_frequencies, tokens):
    # TODO duplicated elsewhere
    words = set(tokens) - punctuation
    return reduce(lambda a, b: a + b, [word_frequencies[word]
                                       if word in word_frequencies else len(word_frequencies) for word in words]) / len(words)


def get_tokens(sentence):
    return [str(x) for x in tagger(sentence)]


def has_word_in_word_set(word_set, words):
    return any(word in word_set for word in words)


def remove_freq_field(result_list):
    for item in result_list:
        item.pop('freq')


def main():
    # TODO fill in as needed
    blocklist = {}
    parser = argparse.ArgumentParser(
        description='Get examples for a set of words in a file')
    parser.add_argument(
        '--frequency-list-filename', help='the filename of a frequency list, one word per line')
    parser.add_argument(
        '--target-sentences-filename', help='the filename of a list of sentences in the target language')
    parser.add_argument(
        '--base-sentences-filename', help='the filename of a list of sentences in the base language')
    parser.add_argument(
        '--word-set', help='the set of words for which to seek examples')

    args = parser.parse_args()

    freqs = get_word_frequencies(args.frequency_list_filename)
    word_set = get_word_set(args.word_set)

    with open(args.target_sentences_filename) as target_sentences:
        with open(args.base_sentences_filename) as base_sentences:
            for line in target_sentences:
                base = base_sentences.readline().strip()
                lower_base = base.lower()
                skip = False
                for word in blocklist:
                    if word in lower_base:
                        skip = True
                if skip:
                    continue
                target = line.strip()
                target_tokens = get_tokens(target)
                if(len(target_tokens) == 0 or not has_word_in_word_set(word_set, target_tokens)):
                    continue
                freq = get_average_frequency(freqs, target_tokens)
                for word in target_tokens:
                    if word in word_set:
                        if len(word_set[word]) < 2:
                            heappush(word_set[word],
                                     (-freq, target_tokens, base))
                        else:
                            heappushpop(
                                word_set[word], (-freq, target_tokens, base))
    sentences = set()
    result = []
    for word in word_set.keys():
        for sentence in word_set[word]:
            joined = ''.join(sentence[1])
            if joined not in sentences:
                sentences.add(joined)
                result.append(
                    {'freq': -sentence[0], 'ja': sentence[1], 'en': sentence[2]})
    result.sort(key=lambda entry: entry['freq'])
    remove_freq_field(result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
