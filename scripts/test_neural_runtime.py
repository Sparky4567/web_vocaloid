import io
import json
from pathlib import Path
import tempfile
import unittest
from unittest.mock import patch
from types import SimpleNamespace
import zipfile

from neural_runtime import allocate, phonemize, safe_extract, singer_root, status
from onnx_schema import inputs


class ScoreTests(unittest.TestCase):
    def test_durations_are_positive_and_conserve_word_length(self):
        for predictions in [[1,2,4],[0,0,0],[float('nan'),float('inf'),-1]]:
            for frames in [3,15,100]:
                result=allocate(predictions,frames)
                self.assertEqual(sum(result),frames)
                self.assertTrue(all(value>=1 for value in result))
        with self.assertRaises(ValueError):
            allocate([1,2,3],2)

    def test_english_pronunciation_keeps_rhotic_and_syllabic_consonants(self):
        symbols=set('L iy aa r0 ll ih t0 ax s z ng th uw dh n ay hh ow g eh er w ae d0 b cl ch jh sh zh k f p m j oy ao aw ah ey uh'.split())
        self.assertEqual(phonemize('are',symbols,{}),['aa','r0'])
        self.assertEqual(phonemize('little',symbols,{}),['ll','ih','t0','ax','ll'])
        for word in ['We','stars','singing','through','the','night','hello','together',"we’re"]:
            self.assertTrue(phonemize(word,symbols,{}),word)
        self.assertEqual(phonemize('the',symbols,{'the':['dh','ax']}),['dh','ax'])

    def test_again_and_other_common_unstressed_vowels(self):
        symbols=set('L iy aa r0 ll ih t0 ax s z ng th uw dh n ay hh ow g eh er w ae d0 b cl ch jh sh zh k f p m j oy ao aw ah ey uh'.split())
        self.assertEqual(phonemize('again',symbols,{}),['ax','g','eh','n'])
        for word in ['about','above','away','around','allow','ago','another','happy','north','force','science','hour']:
            with self.subTest(word=word):
                self.assertTrue(phonemize(word,symbols,{}))

    def test_documented_vowel_aliases_and_stress_suffixes(self):
        cases={'a#':['ax'],'aa':['ae'],'i':['iy'],'O@':['ao','r0'],
               'o@':['ao','r0'],'aI@':['ay','ax'],'aU@':['aw','er'],
               '@5':['ax'],'i@3':['iy','r0']}
        symbols={phone for expected in cases.values() for phone in expected}
        for token,expected in cases.items():
            with self.subTest(token=token), patch('neural_runtime.subprocess.run',return_value=SimpleNamespace(stdout=token)):
                self.assertEqual(phonemize('example',symbols,{}),expected)
        with patch('neural_runtime.subprocess.run',return_value=SimpleNamespace(stdout='unknown-phone')):
            with self.assertRaisesRegex(ValueError,'Unrecognized English sound'):
                phonemize('example',symbols,{})

    def test_archive_extraction_rejects_traversal_and_links(self):
        for name,mode in [('../escape',None),('/escape',None),('link',0o120777<<16)]:
            archive=io.BytesIO()
            with zipfile.ZipFile(archive,'w') as output:
                item=zipfile.ZipInfo(name)
                if mode is not None: item.external_attr=mode
                output.writestr(item,'payload')
            archive.seek(0)
            with tempfile.TemporaryDirectory() as directory,zipfile.ZipFile(archive) as source:
                with self.assertRaises(ValueError):
                    safe_extract(source,Path(directory))

    def test_health_explains_missing_runtime(self):
        result=status()
        self.assertIn('ok',result)
        if not result['ok']:
            self.assertTrue(result['reason'])


class DownloadedModelTests(unittest.TestCase):
    def test_real_model_signatures_match_adapter(self):
        try:
            root=singer_root()
        except RuntimeError:
            self.skipTest('Downloaded singer not present')
        acoustic=inputs(root/'mm_ac_2.8.liee.onnx')
        self.assertEqual(set(acoustic),{'tokens','durations','f0','tension','gender','velocity','steps'})
        self.assertEqual(acoustic['steps'],{'dtype':7,'shape':[]})
        duration=inputs(root/'dsdur/mm_tm_2.8.liee.dur.onnx')
        self.assertEqual(set(duration),{'encoder_out','x_masks','ph_midi'})
        variance=inputs(root/'dsvariance/mm_vr_2.8.liee.variance.onnx')
        self.assertEqual(set(variance),{'encoder_out','ph_dur','pitch','energy','breathiness','voicing','tension','retake','steps'})
        self.assertEqual(variance['retake']['shape'],[1,'n_frames',4])
        self.assertEqual(set(inputs(root/'dsvocoder/nsf_hifigan.onnx')),{'mel','f0'})


if __name__=='__main__': unittest.main()
