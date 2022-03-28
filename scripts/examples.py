import json
from fugashi import Tagger
from functools import reduce
import argparse

tagger = Tagger('-Owakati')


def get_word_frequencies(filename):
    with open(filename) as f:
        return {value.strip(): idx for idx, value in enumerate(f)}


def get_average_frequency(sentences, word_frequencies):
    for key in sentences.keys():
        words = set(sentences[key]['ja'])
        # TODO: how did you ever write this list comprehension!?
        sentences[key]['freq'] = reduce(lambda a, b: a + b, [word_frequencies[word]
                                        if word in word_frequencies else len(word_frequencies) for word in words]) / len(words)


def get_translations(filename):
    # tsv header: ja_id ja_text en_id en_text
    # ja_text can be duplicated; we prefer to get ja_text from transcriptions
    # we assume (due to pre-processing) the number of fields will be correct
    result = {}
    with open(filename) as f:
        for line in f:
            fields = line.split('\t')
            result[fields[0]] = {
                'en': fields[3].strip(), 'ja': fields[1].strip()}
    return result


def tokenize(sentences):
    for key in sentences.keys():
        tokenized = [str(x) for x in tagger(sentences[key]['ja'])]
        sentences[key]['ja'] = tokenized


def remove_freq_field(result_list):
    for item in result_list:
        item.pop('freq')


def main():
    parser = argparse.ArgumentParser(
        description='Get tokenized examples and sort by average word frequency.')
    parser.add_argument(
        '--translation-filename', help='the filename of a file of ja-en translations')
    parser.add_argument(
        '--frequency-list-filename', help='the filename of a file of Japanese words, ranked by frequency, one per line')
    args = parser.parse_args()

    freq_dict = get_word_frequencies(args.frequency_list_filename)
    sentences = get_translations(args.translation_filename)
    tokenize(sentences)
    get_average_frequency(sentences, freq_dict)
    result = list(sentences.values())
    result.sort(key=lambda entry: entry['freq'])
    # shrinking ever so slightly, but not needed on the frontend
    remove_freq_field(result)
    print(json.dumps(result, ensure_ascii=False))


if __name__ == '__main__':
    main()
